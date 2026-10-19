"""Application services owned by Classroom Core."""

from copy import deepcopy
from typing import Any, Callable

from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.modules.platform.errors import DomainError
from app.modules.classroom_core.repositories import PointEntry, Room
from app.modules.ai_providers.service import resolve_provider_chain
from app.modules.classroom_core.repositories import ClassroomAssets

from app.modules.classroom_core.repositories import SessionLink
from app.modules.content_authoring.service import mutate as mutate
from app.modules.content_authoring.repositories import Snapshot
import time
from uuid import UUID, uuid5
from app.modules.classroom_core import runtime as service
from app.modules.content_authoring.service import ensure_other_options
from app.modules.identity_access.repositories import Account
from app.modules.content_authoring.repositories import Script
from app.modules.ai_providers.contracts import SettingsUpdate
from app.modules.ai_providers.repositories import AccountAISettings
from app.modules.ai_providers.service import (
    classroom_settings_view,
    ensure_owner_profiles,
    validate_budget,
    validate_matrix,
)
from app.modules.classroom_core.contracts import AttachScript, CreateBatch, CreateClassroom
from uuid import uuid4
from app.modules.identity_access.service import account
from app.modules.content_authoring.contracts import (
    ScriptDocument,
)
from app.modules.content_authoring.service import prune_scenario_ai


def room_ai_settings(db: Session, room: Room) -> tuple[str, dict]:
    """The owner and the classroom-level AI settings a running room was started with."""
    owner_id = room.creator_id
    state = room.state
    snapshot = state.get("asset_snapshot")
    if state.get("group"):
        snapshot = state["group"].get("asset_snapshot") or snapshot
    ai: dict = {}
    if snapshot:
        ai = deepcopy(snapshot.get("assets", {}).get("ai_settings", {}))
    if not ai and state.get("asset_classroom_id"):
        classroom = db.get(ClassroomAssets, state["asset_classroom_id"])
        if classroom and classroom.owner_id == owner_id:
            ai = deepcopy(classroom.assets.get("ai_settings", {}))
    return owner_id, ai


def room_provider_chain(
    db: Session, room: Room, job_kind: str, context: dict
) -> tuple[list[dict], dict]:
    owner_id, ai = room_ai_settings(db, room)
    return resolve_provider_chain(db, owner_id, ai, job_kind, context)


def owned_classroom(db: Session, cid: str, account: Any, lock: bool = False) -> ClassroomAssets:
    query = select(ClassroomAssets).where(ClassroomAssets.id == cid)
    if lock:
        query = query.with_for_update()
    classroom = db.scalar(query)
    if classroom is None or classroom.owner_id != account.id:
        raise DomainError("CLASSROOM_ASSET_OWNER_REQUIRED", 403)
    return classroom


def link_group_session(db: Session, parent: Any, group: Any) -> None:
    cid = parent.state.get("asset_classroom_id")
    if cid and db.get(SessionLink, group.id) is None:
        db.add(
            SessionLink(
                room_id=group.id,
                classroom_id=cid,
                batch_id=parent.id,
                kind="SESSION",
            )
        )


# Modules above Classroom Core that keep per-room copies of the AI settings (AI students) register
# a handler here; the app shell wires it. Called after a lobby room's snapshot took new settings.
ActiveRoomAISettingsHandler = Callable[[Session, str, "str | None", "str | None"], None]
ACTIVE_ROOM_AI_SETTINGS_HANDLERS: list[ActiveRoomAISettingsHandler] = []


def register_active_room_ai_settings_handler(handler: ActiveRoomAISettingsHandler) -> None:
    if handler not in ACTIVE_ROOM_AI_SETTINGS_HANDLERS:
        ACTIVE_ROOM_AI_SETTINGS_HANDLERS.append(handler)


def apply_ai_settings_to_lobby_room(
    db: Session,
    room_id: str,
    owner_id: str,
    classroom_id: str,
    classroom_revision: int,
    assets: dict[str, Any],
) -> None:
    room = db.get(Room, room_id)
    if room is None or room.creator_id != owner_id:
        raise DomainError("CLASSROOM_OWNER_REQUIRED", 403)
    if room.state.get("phase") != "lobby":
        raise DomainError("LOBBY_REQUIRED", 409)
    state = deepcopy(room.state)
    state["asset_snapshot"] = {
        **deepcopy(state.get("asset_snapshot", {})),
        "assets": deepcopy(assets),
        "classroom_id": classroom_id,
        "classroom_revision": classroom_revision,
    }
    ai = assets["ai_settings"]
    ai_model = ai["model_matrix"].get("ai_student")
    for member in state.get("members", {}).values():
        if member.get("actor_type") == "llm_student":
            if ai_model:
                member["model"] = ai_model
            member["provider_profile_id"] = ai["default_profile_id"]
    room.state = state
    for handler in ACTIVE_ROOM_AI_SETTINGS_HANDLERS:
        handler(db, room_id, ai_model, ai["default_profile_id"])


def classroom_settings_profile_check(db: Session, owner_id: str, profile_id: str) -> str | None:
    for classroom in db.scalars(
        select(ClassroomAssets).where(ClassroomAssets.owner_id == owner_id)
    ):
        ai = classroom.assets.get("ai_settings", {})
        if profile_id in {ai.get("default_profile_id"), ai.get("fallback_profile_id")}:
            return "PROVIDER_PROFILE_IN_CLASSROOM_SETTINGS"
    return None


def account_classroom_progress(db: Session, account: Any) -> dict:
    """Points and achievements an account earned in classrooms, for the account view."""
    points = (
        db.scalar(
            select(func.coalesce(func.sum(PointEntry.amount), 0)).where(
                PointEntry.account_id == account.id
            )
        )
        or 0
    )
    achievements: set[str] = set()
    for room in db.scalars(select(Room)).all():
        for member in room.state.get("members", {}).values():
            if member.get("account_id") == account.id:
                achievements.update(member.get("achievements", []))
    return {"points": points, "achievements": sorted(achievements)}


# Public surface for other modules (they import from service, not from these files).
from app.modules.classroom_core.notices import (  # noqa: E402
    tutor_unavailable_notice as tutor_unavailable_notice,
)
from app.modules.classroom_core.orchestrator import (  # noqa: E402
    GameOrchestrator as GameOrchestrator,
    focus_notice as focus_notice,
    fresh_state as fresh_state,
)
from app.modules.classroom_core.policy import (  # noqa: E402
    baseline_answers as baseline_answers,
    distribution as distribution,
    stage_goal as stage_goal,
)
from app.modules.classroom_core.runtime import (  # noqa: E402
    load as load,
    execute as execute,
    hydrate as hydrate,
)


def user(db, request, mutation=False):
    return account(db, request, mutation)[0]


def _lesson_kind(state: dict) -> str:
    actor_types = {
        member.get("actor_type", "human") for member in state.get("members", {}).values()
    }
    if actor_types == {"llm_student"}:
        return "AI_SIMULATION"
    if "llm_student" in actor_types:
        return "MIXED"
    return "HUMAN"


def _lesson_projection(db, classroom_id: str) -> list[dict]:
    links = db.scalars(
        select(SessionLink)
        .where(
            SessionLink.classroom_id == classroom_id,
            SessionLink.kind == "BATCH",
        )
        .order_by(SessionLink.created_at.desc())
    ).all()
    all_links = db.scalars(
        select(SessionLink).where(SessionLink.classroom_id == classroom_id)
    ).all()
    group_counts: dict[str, int] = {}
    for link in all_links:
        if link.kind == "SESSION":
            group_counts[link.batch_id] = group_counts.get(link.batch_id, 0) + 1

    lessons = []
    for link in links:
        room = db.get(Room, link.room_id)
        if room is None:
            continue
        snapshot = db.get(Snapshot, room.snapshot_id) if room.snapshot_id else None
        document = snapshot.document if snapshot else {}
        questions = document.get("questions", [])
        lessons.append(
            {
                "lesson_id": link.batch_id,
                "batch_id": link.batch_id,
                "room_id": room.id,
                "snapshot_id": snapshot.id if snapshot else None,
                "snapshot_revision": snapshot.revision if snapshot else None,
                "snapshot_sha256": snapshot.content_hash if snapshot else None,
                "title": document.get("title") or room.state.get("title", "Lesson"),
                "question_count": len(questions),
                "lesson_kind": _lesson_kind(room.state),
                "group_count": group_counts.get(link.batch_id, 0),
                "phase": room.state.get("phase"),
                "created_at": link.created_at,
                "source": "immutable_script_snapshot",
            }
        )
    return lessons


def create_library_classroom(db, account, body: CreateClassroom):
    db.scalar(select(Account).where(Account.id == account.id).with_for_update())

    def action():
        cid = str(uuid5(UUID(account.id), "classroom-assets:" + body.action_id))
        classroom = ClassroomAssets(
            id=cid,
            owner_id=account.id,
            title=body.title.strip(),
            assets={"scripts": [], "avatar_pack_id": "stickman"},
        )
        db.add(classroom)
        db.flush()
        return {
            "id": classroom.id,
            "title": classroom.title,
            "revision": classroom.revision,
        }

    return mutate(db, account, "new-classroom", body, action)


def library_classroom_view(db, account, cid: str):
    classroom = owned_classroom(db, cid, account)
    scripts = []
    sessions = []
    for script_id in classroom.assets.get("scripts", []):
        script = db.get(Script, script_id)
        if script and script.owner_id == account.id:
            scripts.append(
                {
                    "id": script.id,
                    "revision": script.revision,
                    "document": script.document,
                }
            )
    for link in db.scalars(
        select(SessionLink)
        .where(SessionLink.classroom_id == cid)
        .order_by(SessionLink.created_at.desc())
    ):
        room = db.get(Room, link.room_id)
        if room:
            sessions.append(
                {
                    "id": room.id,
                    "batch_id": link.batch_id,
                    "kind": link.kind,
                    "phase": room.state["phase"],
                    "title": room.state["title"],
                    "created_at": link.created_at,
                }
            )
    assets_view = deepcopy(classroom.assets)
    assets_view.get("ai_settings", {}).pop("session_token_hash", None)
    return {
        "id": classroom.id,
        "title": classroom.title,
        "revision": classroom.revision,
        "assets": assets_view,
        "scripts": scripts,
        "sessions": sessions,
        "lessons": _lesson_projection(db, cid),
    }


def attach_classroom_script(db, account, cid: str, body: AttachScript):
    classroom = owned_classroom(db, cid, account, True)

    def action():
        if body.script_id:
            script = db.get(Script, body.script_id)
            if script is None or script.owner_id != account.id:
                raise DomainError("SCRIPT_OWNER_REQUIRED", 403)
        else:
            document = ScriptDocument.model_validate(
                ensure_other_options(body.document or {})
            ).model_dump()
            from app.modules.content_authoring.service import validate_scenario_ai

            validate_scenario_ai(db, account.id, document)
            script = Script(
                id=str(uuid5(UUID(classroom.id), body.action_id)),
                owner_id=account.id,
                document=document,
                revision=1,
            )
            db.add(script)
            db.flush()
        assets = deepcopy(classroom.assets)
        ids = assets.setdefault("scripts", [])
        if script.id not in ids:
            ids.append(script.id)
            classroom.assets = assets
            classroom.revision += 1
        return {
            "id": script.id,
            "revision": script.revision,
            "document": script.document,
            "classroom_id": cid,
        }

    return mutate(db, account, "script:" + cid, body, action)


def create_classroom_batch(db, account, cid: str, body: CreateBatch):
    classroom = owned_classroom(db, cid, account, True)
    if body.script_id not in classroom.assets.get("scripts", []):
        raise DomainError("CLASSROOM_SCRIPT_REQUIRED", 422)

    def action():
        response = service.create_room(db, account, body.script_id)
        room = db.get(Room, response["id"])
        state = deepcopy(room.state)
        state["asset_classroom_id"] = cid
        state["asset_classroom_revision"] = classroom.revision
        state["asset_snapshot"] = deepcopy(classroom.assets)
        room.state = state
        db.add(
            SessionLink(
                room_id=room.id,
                classroom_id=cid,
                batch_id=room.id,
                kind="BATCH",
            )
        )
        return {
            "id": room.id,
            "classroom_id": cid,
            "batch_id": room.id,
            "code": room.code,
        }

    return mutate(db, account, "batch:" + cid, body, action)


def update_classroom_ai_settings(db, account, session, cid: str, body: SettingsUpdate):
    classroom = owned_classroom(db, cid, account, True)
    ensure_owner_profiles(db, account.id, [body.default_profile_id, body.fallback_profile_id])
    assets = deepcopy(classroom.assets)
    prior = assets.get("ai_settings", {})
    assets["ai_settings"] = {
        "default_profile_id": body.default_profile_id,
        "fallback_profile_id": body.fallback_profile_id,
        "model_matrix": validate_matrix(body.model_matrix),
        "scenario_overrides": deepcopy(prior.get("scenario_overrides", {})),
        "budgets": validate_budget(body.budgets),
        "revision": int(prior.get("revision", 0)) + 1,
    }
    classroom.assets = assets
    classroom.revision += 1
    account_settings = db.get(AccountAISettings, account.id)
    if account_settings is None:
        account_settings = AccountAISettings(owner_id=account.id)
        db.add(account_settings)
    account_settings.session_token_hash = session.token_hash
    account_settings.updated_at = time.time()
    if body.active_room_id:
        apply_ai_settings_to_lobby_room(
            db, body.active_room_id, account.id, cid, classroom.revision, assets
        )
    return classroom_settings_view(assets["ai_settings"])


def adopt_room_question(db, a, _, script_id: str, room_id: str, index: int):
    room, _, teacher = service.load(db, room_id, a.id)
    s = db.scalar(select(Script).where(Script.id == script_id).with_for_update())
    if not teacher or s is None or s.owner_id != a.id:
        raise DomainError("SCRIPT_OWNER_REQUIRED", 403)
    if index < 0 or index >= len(room.state["questions"]):
        raise DomainError("QUESTION_REQUIRED", 404)
    # A run question keeps its scenario_ai only while that profile is still the owner's.
    q = prune_scenario_ai(db, a.id, room.state["questions"][index])
    q["id"] = "adopted-" + uuid4().hex[:10]
    doc = deepcopy(s.document)
    doc["questions"].append(q)
    s.document = ScriptDocument.model_validate(doc).model_dump()
    s.revision += 1
    return {"id": s.id, "revision": s.revision}


def adjust_room_budget(db, a, _, room_id: str, live_llm_call_budget: int):
    room, _, teacher = service.load(db, room_id, a.id, True)
    if not teacher:
        raise DomainError("TEACHER_MEMBERSHIP_REQUIRED", 403)
    state = deepcopy(room.state)
    if "script" not in state:
        raise DomainError("STARTED_CLASSROOM_REQUIRED")
    state["script"]["live_llm_call_budget"] = live_llm_call_budget
    room.state = state
    from app.modules.llm_runtime.repositories import Job
    from app.modules.classroom_core.repositories import append_event

    for j in db.scalars(select(Job).where(Job.room_id == room.id, Job.state == "PENDING")):
        j.next_at = time.time()
    append_event(
        db,
        room,
        {"type": "budget.updated", "payload": {"live_llm_call_budget": live_llm_call_budget}},
    )
    return {"live_llm_call_budget": live_llm_call_budget, "used": room.llm_used}


# Public surface for other modules (they import from service, not from these files).
