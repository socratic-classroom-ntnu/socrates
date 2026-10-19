"""Shared application services owned by Group Dialogue."""

from __future__ import annotations


from typing import Any, Iterable, cast

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.platform.errors import DomainError
from app.modules.classroom_core.repositories import Membership
from app.modules.group_dialogue.repositories import AIStudentProfile
from app.modules.platform.storage import digest
from app.modules.classroom_core.service import load as load_classroom
from app.modules.classroom_core.repositories import (
    ActionReceipt,
)
from app.modules.classroom_core import service as service
from copy import deepcopy
from hashlib import sha256
import json
from uuid import UUID, uuid5
from pydantic import BaseModel
from app.modules.identity_access.repositories import Account
from app.modules.classroom_core.repositories import Room
from app.modules.group_dialogue.ai_students import PERSONAS
from app.modules.group_dialogue.contracts import OtherSuggestionRequest
from types import SimpleNamespace
from uuid import uuid4
import secrets
import time
from app.modules.classroom_core.repositories import (
    append_event,
    persist_machine,
)
from app.modules.content_authoring.repositories import Script, Snapshot
from app.modules.classroom_core.service import GameOrchestrator, fresh_state
from app.modules.group_dialogue.group_run import (
    initialise,
)
from app.modules.classroom_core.repositories import ClassroomAssets
from app.modules.classroom_core.service import link_group_session
from app.modules.group_dialogue.contracts import Configure, GroupCommand, Start
from app.modules.classroom_core.service import focus_notice
from app.modules.group_dialogue.group_run import (
    person_summary,
    personal_progress,
    personal_student_view,
    personal_teacher_view,
    student_actions,
)
from app.modules.group_dialogue.stance import current_stance
from app.modules.content_authoring.service import visible_evidence
from app.modules.content_authoring.contracts import public_question

from app.modules.group_dialogue.contracts import (
    AddAIStudents,
    ClearAIStudents,
)
from app.modules.classroom_core.service import load
from app.modules.platform.rate_limit import enforce_rate_limit
from app.modules.platform.storage import transaction


def actor(db: Session, request: Request, mutation: bool = False) -> Any:
    # Resolve the already-initialised native adapter lazily to preserve imports.
    from app.modules.identity_access.service import account

    return account(db, request, mutation)[0]


def roster(db: Session, room: Any) -> list[Membership]:
    return list(
        db.scalars(
            select(Membership)
            .where(Membership.room_id == room.id, Membership.role == "student")
            .order_by(Membership.seat, Membership.id)
        )
    )


def roster_hash(rows: Iterable[Membership]) -> str:
    return cast(str, digest([{"id": r.id, "alias": r.alias, "seat": r.seat} for r in rows]))


def teacher_room(db: Session, rid: str, a: Any) -> Any:
    room, _, teacher = load_classroom(db, rid, a.id, True)
    if not teacher:
        raise DomainError("TEACHER_MEMBERSHIP_REQUIRED", 403)
    if room.state.get("group"):
        raise DomainError("CLASSROOM_PARENT_REQUIRED", 422)
    return room


def update_ai_student_profiles(
    db: Session, room_id: str, ai_model: str | None, default_profile_id: str | None
) -> None:
    """A lobby room took new classroom AI settings: its AI students follow the new model and profile."""
    for profile in db.scalars(
        select(AIStudentProfile).where(AIStudentProfile.parent_room_id == room_id)
    ):
        if ai_model:
            profile.model = ai_model
        profile.provider_profile_id = default_profile_id


def ai_student_profile_check(db: Session, owner_id: str, profile_id: str) -> str | None:
    used = db.scalar(
        select(AIStudentProfile.account_id)
        .where(AIStudentProfile.provider_profile_id == profile_id)
        .limit(1)
    )
    return "PROVIDER_PROFILE_IN_AI_STUDENT" if used is not None else None


# Public surface for other modules (they import from service, not from these files).
from app.modules.group_dialogue.stance import (  # noqa: E402
    stance_distribution as stance_distribution,
)


def _action_contract(reasons: dict[str, str | None]) -> dict:
    return {
        "available_actions": [action for action, reason in reasons.items() if reason is None],
        "unavailable_actions": {
            action: reason for action, reason in reasons.items() if reason is not None
        },
    }


def parent_teacher_actions(state: dict, rows) -> dict:
    """Backend authority for teacher controls on the group overview."""
    from app.modules.platform.feature_flags import feature_state

    phase = state.get("phase")
    cfg = state.get("classroom") or {}
    roster_digest = roster_hash(rows)
    ai_feature = feature_state("ai_students")
    has_ai = any(
        state.get("members", {}).get(row.id, {}).get("actor_type") == "llm_student" for row in rows
    )
    lobby_reason = None if phase == "lobby" else "LOBBY_REQUIRED"
    configure_reason = lobby_reason or (None if rows else "CURRENT_POPULATED_ROSTER_REQUIRED")
    start_reason = lobby_reason
    if start_reason is None and not rows:
        start_reason = "CURRENT_POPULATED_ROSTER_REQUIRED"
    elif start_reason is None and (
        cfg.get("state") != "CONFIGURED" or cfg.get("roster_digest") != roster_digest
    ):
        start_reason = "CURRENT_GROUP_CONFIGURATION_REQUIRED"
    add_reason = lobby_reason or ai_feature["reason"]
    clear_reason = (
        lobby_reason or ai_feature["reason"] or (None if has_ai else "AI_STUDENTS_REQUIRED")
    )
    return _action_contract(
        {
            "configure": configure_reason,
            "start": start_reason,
            "add_ai_students": add_reason,
            "clear_ai_students": clear_reason,
        }
    )


def group_teacher_actions(state: dict) -> dict:
    """Backend authority for teacher controls on one group run."""
    next_phases = {
        "answering",
        "personal",
        "distribution",
        "focus",
        "focus_summary",
        "preview",
        "viewpoint_review",
        "final_reflection",
    }
    next_reason = None if state.get("phase") in next_phases else "CURRENT_PHASE_ACTIONS"
    settled = state.get("group", {}).get("settlement", {}).get("state") == "SETTLED"
    end_reason = "GROUP_ALREADY_SETTLED" if settled else None
    return _action_contract({"next": next_reason, "end": end_reason})


def receipt(db, room, a, body, operation):
    hashed = digest({"operation": operation, **body.model_dump()})
    old = db.scalar(
        select(ActionReceipt).where(
            ActionReceipt.room_id == room.id,
            ActionReceipt.actor_id == a.id,
            ActionReceipt.action_id == body.action_id,
        )
    )
    if old:
        if old.payload_hash != hashed:
            raise DomainError("ACTION_ID_PAYLOAD_CONFLICT", 409)
        return hashed, old.receipt
    return hashed, None


def save_receipt(db, room, a, body, hashed, value):
    db.add(
        ActionReceipt(
            room_id=room.id,
            actor_id=a.id,
            action_id=body.action_id,
            payload_hash=hashed,
            receipt=value,
        )
    )
    return value


def allocate(rows, count, capacity, chosen):
    members = {r.id for r in rows}
    if set(chosen) - members:
        raise DomainError("CURRENT_ROSTER_REQUIRED", 409)
    result, sizes = {}, [0] * count
    for mid, number in chosen.items():
        if not 0 <= number < count:
            raise DomainError("GROUP_INDEX_REQUIRED", 422)
        result[mid] = number
        sizes[number] += 1
    if any(x > capacity for x in sizes) or len(rows) > count * capacity:
        raise DomainError("GROUP_CAPACITY_REQUIRED", 409)
    for r in rows:
        if r.id not in result:
            number = min(range(count), key=lambda i: (sizes[i], i))
            if sizes[number] >= capacity:
                raise DomainError("GROUP_CAPACITY_REQUIRED", 409)
            result[r.id] = number
            sizes[number] += 1
    return result


def _receipt(db, room: Room, actor: Account, body: BaseModel, operation: str):
    key_hash = digest({"operation": operation, **body.model_dump()})
    prior = db.scalar(
        select(ActionReceipt).where(
            ActionReceipt.room_id == room.id,
            ActionReceipt.actor_id == actor.id,
            ActionReceipt.action_id == body.action_id,  # type: ignore[attr-defined]
        )
    )
    if prior:
        if prior.payload_hash != key_hash:
            from app.modules.platform.errors import DomainError

            raise DomainError("ACTION_ID_PAYLOAD_CONFLICT", 409)
        return key_hash, prior.receipt
    return key_hash, None


def _save_receipt(db, room, actor, body, key_hash, response):
    db.add(
        ActionReceipt(
            room_id=room.id,
            actor_id=actor.id,
            action_id=body.action_id,
            payload_hash=key_hash,
            receipt=response,
        )
    )
    return response


def _persona(index: int, room_id: str) -> dict:
    base: dict[str, Any] = deepcopy(PERSONAS[index % len(PERSONAS)])
    # ai_students.seed 是 Postgres INTEGER（有號 32 位元）；8 個 hex 最大到 2**32-1，約一半的值會溢位。
    base["seed"] = (
        int(sha256(f"{room_id}:{index}:{base['id']}".encode()).hexdigest()[:8], 16) % 2**31
    )
    return base


def ai_student_ids(room_id: str, action_id: str, index: int) -> tuple[str, str]:
    """Deterministic ids for one add-ai-students action; a replay returns the stored receipt."""
    account_id = str(uuid5(UUID(room_id), f"ai-student-account:{action_id}:{index}"))
    membership_id = str(uuid5(UUID(room_id), f"ai-student-member:{account_id}"))
    return account_id, membership_id


def fallback_other_suggestion(body: OtherSuggestionRequest) -> dict:
    text = (
        "也許可以把受影響者的選擇權、長期後果與誰承擔代價放在一起比較，"
        "再說明哪一項原則最值得優先。"
    )
    sid = sha256(
        json.dumps(body.model_dump(), ensure_ascii=False, sort_keys=True).encode()
    ).hexdigest()[:16]
    return {
        "suggestion_text": text,
        "suggestion_id": "fallback-" + sid,
        "suggestion_model": None,
        "suggestion_provider": "deterministic-ai-suggestion",
    }


def configure_groups(db, a, rid: str, body: Configure):
    room = teacher_room(db, rid, a)
    hashed, prior = receipt(db, room, a, body, "configure")
    if prior:
        return prior
    if room.state["phase"] != "lobby":
        raise DomainError("LOBBY_REQUIRED", 409)
    rows = roster(db, room)
    if body.expected_roster_digest != roster_hash(rows):
        raise DomainError("CURRENT_ROSTER_DIGEST_REQUIRED", 409)
    assignments = allocate(rows, body.group_count, body.members_per_group, body.assignments)
    state = deepcopy(room.state)
    old = state.get("classroom", {})
    state["classroom"] = {
        "revision": old.get("revision", 0) + 1,
        "state": "CONFIGURED",
        "group_count": body.group_count,
        "members_per_group": body.members_per_group,
        "assignments": assignments,
        "avatar_pack_id": body.avatar_pack_id,
        "roster_digest": roster_hash(rows),
    }
    room.state = state
    cid = state.get("asset_classroom_id")
    if cid:
        asset_classroom = db.scalar(
            select(ClassroomAssets).where(ClassroomAssets.id == cid).with_for_update()
        )
        if asset_classroom is None or asset_classroom.owner_id != a.id:
            raise DomainError("CLASSROOM_ASSET_OWNER_REQUIRED", 403)
        assets = deepcopy(asset_classroom.assets)
        assets.update(
            avatar_pack_id=body.avatar_pack_id,
            group_count=body.group_count,
            members_per_group=body.members_per_group,
        )
        asset_classroom.assets = assets
        asset_classroom.revision += 1
    append_event(
        db,
        room,
        {
            "type": "groups.configured",
            "payload": {"revision": state["classroom"]["revision"]},
        },
    )
    return save_receipt(
        db,
        room,
        a,
        body,
        hashed,
        {"status": "RECORDED", "action_id": body.action_id, "seq": room.seq},
    )


def start_groups(db, a, rid: str, body: Start):
    room = teacher_room(db, rid, a)
    hashed, prior = receipt(db, room, a, body, "start")
    if prior:
        return prior
    if room.state["phase"] != "lobby":
        raise DomainError("LOBBY_REQUIRED", 409)
    rows = roster(db, room)
    if not rows or body.expected_roster_digest != roster_hash(rows):
        raise DomainError("CURRENT_POPULATED_ROSTER_REQUIRED", 409)
    state = deepcopy(room.state)
    cfg = state.get("classroom")
    if not cfg or cfg["roster_digest"] != roster_hash(rows):
        raise DomainError("CURRENT_GROUP_CONFIGURATION_REQUIRED", 409)
    assignments = allocate(rows, cfg["group_count"], cfg["members_per_group"], cfg["assignments"])
    # Only populated groups instantiate a runtime; the configured empty slots stay visible.
    script = db.scalar(select(Script).where(Script.id == room.script_id).with_for_update())
    if script is None or script.owner_id != a.id:
        raise DomainError("SCRIPT_OWNER_REQUIRED", 403)
    from app.modules.content_authoring.service import ensure_other_options

    document = ensure_other_options(script.document)
    snap = Snapshot(
        id=str(uuid4()),
        script_id=script.id,
        revision=script.revision,
        document=deepcopy(document),
        content_hash=digest(document),
    )
    db.add(snap)
    db.flush()
    room.snapshot_id = snap.id
    temporary = [r for r in rows if not r.alias.strip() or r.alias.startswith("~pending-")]
    if temporary and not body.accept_temporary_aliases:
        raise DomainError("TEACHER_TEMPORARY_ALIAS_CONFIRMATION_REQUIRED", 409)
    asset_id = state.get("asset_classroom_id")
    assets = (
        db.scalar(select(ClassroomAssets).where(ClassroomAssets.id == asset_id).with_for_update())
        if asset_id
        else None
    )
    if asset_id and (assets is None or assets.owner_id != a.id):
        raise DomainError("CLASSROOM_ASSET_OWNER_REQUIRED", 403)
    actor_types = {state["members"][row.id].get("actor_type", "human") for row in rows}
    lesson_kind = (
        "AI_SIMULATION"
        if actor_types == {"llm_student"}
        else "MIXED"
        if "llm_student" in actor_types
        else "HUMAN"
    )
    asset_snapshot = {
        "classroom_id": asset_id,
        "classroom_revision": assets.revision if assets else None,
        "assets": deepcopy(assets.assets) if assets else {},
        "script_snapshot_id": snap.id,
        "script_sha256": snap.content_hash,
        "avatar_pack_id": cfg["avatar_pack_id"],
        "lesson_kind": lesson_kind,
    }
    asset_snapshot["digest"] = digest(asset_snapshot)
    state["asset_snapshot"] = asset_snapshot
    now, groups, mapping = time.time(), [], {}
    for number in range(cfg["group_count"]):
        assigned = [r for r in rows if assignments[r.id] == number]
        if not assigned:
            continue
        # 組別 id 只在開課這一次推導並存進資料列；重送同一個開課動作由 receipt 回傳原結果。
        gid = str(uuid5(UUID(room.id), f"classroom-group:{body.action_id}:{number}"))
        g = Room(
            id=gid,
            creator_id=a.id,
            script_id=script.id,
            snapshot_id=snap.id,
            code=secrets.token_hex(4).upper(),
            state=fresh_state(snap.document["title"]),
            seq=0,
        )
        db.add(g)
        db.flush()
        db.add(
            Membership(
                room_id=gid,
                account_id=a.id,
                role="teacher",
                alias="教師",
                avatar="teacher",
                seat=None,
            )
        )
        gs = deepcopy(g.state)
        for seat, original in enumerate(assigned):
            mid = str(uuid5(UUID(gid), original.id))
            alias = original.alias.strip()
            if not alias or alias.startswith("~pending-"):
                alias = f"學生 {rows.index(original) + 1}"
            m = Membership(
                id=mid,
                room_id=gid,
                account_id=original.account_id,
                role="student",
                alias=alias,
                avatar=original.avatar,
                seat=seat,
                last_seen=original.last_seen,
            )
            db.add(m)
            gs["members"][mid] = {
                **deepcopy(state["members"][original.id]),
                "alias": alias,
                "seat": seat,
            }
            mapping[original.id] = {"group_id": gid, "membership_id": mid}
        gs["group"] = initialise(gid, room.id, snap.id, list(gs["members"]), f"Group {number+1}")
        gs["group"]["avatar_pack_id"] = cfg["avatar_pack_id"]
        gs["group"]["asset_snapshot"] = deepcopy(asset_snapshot)
        machine = GameOrchestrator(gs, now)
        machine.command("start", {"script_document": snap.document}, None, True)
        persist_machine(db, g, machine)
        link_group_session(db, room, g)
        groups.append({"id": gid, "number": number, "label": f"Group {number+1}"})
    cfg.update(
        state="STARTED",
        groups=groups,
        mapping=mapping,
        snapshot_id=snap.id,
        snapshot_sha=snap.content_hash,
        started_at=now,
        membership_snapshot=[r.id for r in rows],
    )
    state.update(phase="group_overview", deadline_at=None, due_at=None)
    room.state, room.due_at = state, None
    append_event(
        db,
        room,
        {
            "type": "groups.started",
            "payload": {"group_count": len(groups), "snapshot_id": snap.id},
        },
    )
    return save_receipt(
        db,
        room,
        a,
        body,
        hashed,
        {
            "status": "RECORDED",
            "action_id": body.action_id,
            "groups": groups,
            "snapshot_id": snap.id,
            "seq": room.seq,
        },
    )


def run_group_command(db, a, rid: str, body: GroupCommand):
    room, _, _ = load(db, rid, a.id)
    if not room.state.get("group"):
        raise DomainError("GROUP_RUN_REQUIRED", 422)
    return service.execute(db, a, rid, SimpleNamespace(**body.model_dump()))


def reveal_member_identity(db, a, rid: str, mid: str):
    room, _, teacher = load(db, rid, a.id)
    if not teacher:
        raise DomainError("TEACHER_MEMBERSHIP_REQUIRED", 403)
    member = room.state["members"].get(mid)
    if member is None:
        raise DomainError("GROUP_MEMBER_REQUIRED", 404)
    return {"username": member["username"], "scope": "teacher_hover_only"}


def group_classroom_view(db, a, rid: str, requested_mode):
    room, member, teacher = load(db, rid, a.id)
    if member is not None:
        member.last_seen = time.time()
        db.flush()
    state = service.hydrate(db, room)
    mode = "teacher" if teacher and requested_mode == "teacher" else "student"
    if state.get("group"):
        p = state["group"]
        visible_nodes, visible_edges = visible_evidence(
            p["arguments"], p["edges"], member.id if member else None, mode == "teacher"
        )
        public_members = [
            {
                "id": mid,
                "alias": m["alias"],
                "actor_type": m.get("actor_type", "human"),
                "persona_id": (m.get("persona") or {}).get("id"),
            }
            for mid, m in state["members"].items()
        ]
        teacher_actions = group_teacher_actions(state) if mode == "teacher" else None
        return {
            "kind": "GroupRun",
            "id": rid,
            "role": mode,
            "seq": room.seq,
            "title": state["title"],
            "phase": state["phase"],
            "deadline_at": state["deadline_at"],
            "member_id": member.id if member else None,
            "members": public_members,
            "runtime_mode": p["runtime_mode"],
            "session_batch_id": p["classroom_id"],
            "group_label": p["label"],
            "classroom_id": p["classroom_id"],
            "question": public_question(state["questions"][state["question_index"]])
            if state["question_index"] >= 0
            else None,
            "transcript": [
                {
                    "member_id": f["member_id"],
                    "messages": [{"role": x["role"], "text": x["text"]} for x in f["messages"]],
                }
                for run in state["runs"]
                for f in run["focuses"]
            ],
            "arguments": visible_nodes,
            "edges": visible_edges,
            "settlement": p["settlement"],
            "confirmed_members": list(p["confirmations"]),
            "my_summary": person_summary(state, member.id) if member else None,
            "avatar_pack_id": p.get("avatar_pack_id", "stickman"),
            "source_mode": state["source_mode"],
            "focus_notice": focus_notice(state),
            # Own dialogue only; other students' personal dialogues never reach a student.
            "personal": personal_student_view(state, member.id)
            if member and mode == "student"
            else None,
            "available_actions": student_actions(state, member.id)
            if member and mode == "student"
            else teacher_actions["available_actions"]
            if teacher_actions
            else [],
            "unavailable_actions": teacher_actions["unavailable_actions"]
            if teacher_actions
            else {},
            "personal_progress": personal_progress(state) if mode == "teacher" else None,
            "personal_overview": personal_teacher_view(state) if mode == "teacher" else None,
        }
    rows = roster(db, room)
    cfg = state.get("classroom", {})
    if mode != "teacher" and cfg.get("state") == "STARTED":
        return {
            "kind": "GroupCollection",
            "id": rid,
            "role": mode,
            "route": cfg["mapping"].get(member.id, {}) if member else {},
        }
    if mode != "teacher":
        return {"kind": "Legacy", "id": rid}
    groups = []
    for meta in cfg.get("groups", []):
        g = db.get(Room, meta["id"])
        if g:
            p = g.state["group"]
            groups.append(
                {
                    **meta,
                    "phase": g.state["phase"],
                    "members": len(p["member_snapshot"]),
                    "acked": len(p["confirmations"]),
                    "settlement": p["settlement"]["state"],
                    "personal_progress": personal_progress(g.state),
                    # Teacher-only branch: students are routed above and never reach it.
                    "stance": current_stance(g.state),
                }
            )
    asset_id = state.get("asset_classroom_id")
    asset_classroom = db.get(ClassroomAssets, asset_id) if asset_id else None
    from app.modules.ai_providers.service import classroom_settings_view
    from app.modules.platform.feature_flags import feature_states

    ai_settings = classroom_settings_view(
        asset_classroom.assets.get("ai_settings") if asset_classroom else {}
    )
    teacher_actions = parent_teacher_actions(state, rows)
    return {
        "kind": "GroupCollection",
        "id": rid,
        "role": mode,
        "title": state["title"],
        "phase": state["phase"],
        "code": room.code if state["phase"] == "lobby" else None,
        "asset_classroom_id": asset_id,
        "ai_settings": ai_settings,
        "features": feature_states("ai_students"),
        "roster": [
            {
                "id": r.id,
                "alias": r.alias,
                "group": cfg.get("assignments", {}).get(r.id),
                "actor_type": state["members"][r.id].get("actor_type", "human"),
                "persona_id": (state["members"][r.id].get("persona") or {}).get("id"),
                "model": state["members"][r.id].get("model"),
            }
            for r in rows
        ],
        "roster_digest": roster_hash(rows),
        "configuration": {
            k: cfg.get(k)
            for k in ["group_count", "members_per_group", "avatar_pack_id", "revision"]
        },
        "groups": groups,
        **teacher_actions,
    }


def add_ai_students_to_room(db, teacher, rid: str, body: AddAIStudents):
    room = teacher_room(db, rid, teacher)
    if room.state["phase"] != "lobby":
        raise DomainError("LOBBY_REQUIRED", 409)
    key_hash, prior = _receipt(db, room, teacher, body, "add-ai-students")
    if prior:
        return prior

    state = deepcopy(room.state)
    existing = db.scalars(
        select(AIStudentProfile).where(AIStudentProfile.parent_room_id == rid)
    ).all()
    start_index = len(existing)
    created = []
    for offset in range(body.count):
        index = start_index + offset
        persona = _persona(index, rid)
        account_id, membership_id = ai_student_ids(rid, body.action_id, index)
        alias = f"{persona['name']} · AI"
        account = db.get(Account, account_id)
        if account is None:
            account = Account(
                id=account_id,
                username=f"ai-{rid[:8]}-{index + 1}",
                email=f"{account_id}@ai.invalid",
                password_hash="AI_ACTOR_ONLY",
                verified=True,
            )
            db.add(account)
        profile = db.get(AIStudentProfile, account_id)
        if profile is None:
            profile = AIStudentProfile(
                account_id=account_id,
                parent_room_id=rid,
                persona=persona,
                model=body.model,
                provider_profile_id=body.provider_profile_id,
                seed=persona["seed"],
                enabled=True,
            )
            db.add(profile)
        member = db.get(Membership, membership_id)
        if member is None:
            seat = len(state["members"])
            member = Membership(
                id=membership_id,
                room_id=rid,
                account_id=account_id,
                role="student",
                alias=alias,
                avatar="ai-student",
                seat=seat,
                last_seen=time.time(),
            )
            db.add(member)
            state["members"][membership_id] = {
                "account_id": account_id,
                "username": account.username,
                "alias": alias,
                "avatar": "ai-student",
                "seat": seat,
                "last_seen": member.last_seen,
                "selected_count": 0,
                "points": 0,
                "achievements": [],
                "reactions_sent": 0,
                "reactions_received": 0,
                "actor_type": "llm_student",
                "persona": persona,
                "model": body.model,
                "provider_profile_id": body.provider_profile_id,
            }
        created.append(
            {
                "account_id": account_id,
                "membership_id": membership_id,
                "alias": alias,
                "persona_id": persona["id"],
                "model": body.model,
                "provider_profile_id": body.provider_profile_id,
            }
        )

    room.state = state
    append_event(
        db,
        room,
        {
            "type": "ai_students.added",
            "payload": {"count": len(created), "members": created},
        },
    )
    db.flush()
    response = {
        "status": "RECORDED",
        "action_id": body.action_id,
        "created": created,
        "roster_digest": roster_hash(roster(db, room)),
        "room_id": rid,
        "seq": room.seq,
    }
    return _save_receipt(db, room, teacher, body, key_hash, response)


def clear_ai_students_from_room(db, teacher, rid: str, body: ClearAIStudents):
    room = teacher_room(db, rid, teacher)
    if room.state["phase"] != "lobby":
        raise DomainError("LOBBY_REQUIRED", 409)
    key_hash, prior = _receipt(db, room, teacher, body, "clear-ai-students")
    if prior:
        return prior

    profiles = db.scalars(
        select(AIStudentProfile).where(AIStudentProfile.parent_room_id == rid)
    ).all()
    accounts = {profile.account_id for profile in profiles}
    members = db.scalars(
        select(Membership).where(
            Membership.room_id == rid,
            Membership.account_id.in_(accounts),
        )
    ).all()
    state = deepcopy(room.state)
    for member in members:
        state["members"].pop(member.id, None)
        db.delete(member)
    for profile in profiles:
        db.delete(profile)
        if (
            db.scalar(
                select(Membership.id).where(Membership.account_id == profile.account_id).limit(1)
            )
            is None
        ):
            account = db.get(Account, profile.account_id)
            if account:
                db.delete(account)

    room.state = state
    append_event(
        db,
        room,
        {"type": "ai_students.cleared", "payload": {"count": len(members)}},
    )
    db.flush()
    response = {
        "status": "RECORDED",
        "action_id": body.action_id,
        "removed": len(members),
        "roster_digest": roster_hash(roster(db, room)),
        "room_id": rid,
        "seq": room.seq,
    }
    return _save_receipt(db, room, teacher, body, key_hash, response)


async def suggest_other_option(actor, session, body: OtherSuggestionRequest):
    from app.modules.classroom_core import service as service
    from app.modules.llm_runtime.contracts import OtherSuggestionResult
    from app.modules.platform.errors import DomainError
    from app.modules.ai_providers.service import ProviderWait
    from app.modules.llm_runtime.service import guarded_generate
    from app.modules.classroom_core.service import room_ai_settings
    from app.modules.ai_providers.service import (
        provider_error_status,
        record_direct_call_audit,
        resolve_request_chain,
    )

    with transaction() as db:
        enforce_rate_limit(db, f"other-suggestion:{actor.id}", 30, 60)
        room = None
        if body.room_id:
            room, _, _ = load(db, body.room_id, actor.id)
        bindings, routing = resolve_request_chain(
            db,
            account=actor,
            session=session,
            role="other_suggestion",
            classroom=room_ai_settings(db, room) if room else None,
        )
    messages = [
        {
            "role": "system",
            "content": (
                "請以繁體中文提出一個簡短、有啟發性、可由學生自行修改的其他觀點。"
                "內容保持一到兩句，聚焦新的判斷角度。"
            ),
        },
        {
            "role": "user",
            "content": json.dumps(body.model_dump(), ensure_ascii=False),
        },
    ]

    async def no_delta(_):
        return None

    failure: DomainError | None = None
    for binding in bindings:
        started = time.monotonic()
        try:
            result, audit = await guarded_generate(
                binding,
                messages,
                OtherSuggestionResult,
                no_delta,
                kind="other_suggestion",
                context=body.model_dump(),
            )
            response = {
                "suggestion_text": result["suggestion_text"],
                "suggestion_id": audit.get("request_id")
                or sha256(result["suggestion_text"].encode()).hexdigest()[:16],
                "suggestion_model": audit.get("actual_model"),
                "suggestion_provider": audit.get("provider"),
                "provider_profile_id": audit.get("provider_profile_id"),
                "classroom_owner_id": routing.get("owner_id"),
            }
            record_direct_call_audit(
                actor_id=actor.id,
                endpoint="suggestions.other",
                role="other_suggestion",
                binding=binding,
                state="READY",
                audit=audit,
            )
            return response
        except ProviderWait as exc:
            record_direct_call_audit(
                actor_id=actor.id,
                endpoint="suggestions.other",
                role="other_suggestion",
                binding=binding,
                state="FAILED",
                reason_code=exc.reason,
                latency_ms=round((time.monotonic() - started) * 1000),
            )
            failure = DomainError(exc.reason, provider_error_status(exc.reason))
        except (KeyError, TypeError, ValueError):
            reason = "PROVIDER_SCHEMA_MISMATCH"
            record_direct_call_audit(
                actor_id=actor.id,
                endpoint="suggestions.other",
                role="other_suggestion",
                binding=binding,
                state="FAILED",
                reason_code=reason,
                latency_ms=round((time.monotonic() - started) * 1000),
            )
            failure = DomainError(reason, provider_error_status(reason))
    if failure is not None:
        raise failure
    response = fallback_other_suggestion(body)
    record_direct_call_audit(
        actor_id=actor.id,
        endpoint="suggestions.other",
        role="other_suggestion",
        binding=None,
        state="READY",
        audit={
            "provider": response["suggestion_provider"],
            "actual_model": response["suggestion_model"],
            "latency_ms": 0,
            "token_usage": {},
        },
    )
    return response
