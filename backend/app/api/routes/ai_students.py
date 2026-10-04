"""AI-student HTTP routes. Kept apart so the orchestrator never imports provider modules."""

from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
import json
import time
from typing import Any
from uuid import UUID, uuid5

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from .storage import (
    Account,
    ActionReceipt,
    Membership,
    Room,
    digest,
    transaction,
)

from .portal_ai_students import PERSONAS, AIStudentProfile


class AddAIStudents(BaseModel):
    action_id: str = Field(min_length=8, max_length=100)
    count: int = Field(ge=1, le=40)
    model: str = Field(default="openrouter/free", min_length=1, max_length=160)
    provider_profile_id: str | None = None


class ClearAIStudents(BaseModel):
    action_id: str = Field(min_length=8, max_length=100)


class OtherSuggestionRequest(BaseModel):
    question_id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=300)
    scenario: str = Field(min_length=1, max_length=12000)
    existing_options: list[str] = Field(default_factory=list, max_length=20)
    room_id: str | None = None


router = APIRouter()


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
            from .orchestrator import DomainError

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
    base["seed"] = int(sha256(f"{room_id}:{index}:{base['id']}".encode()).hexdigest()[:8], 16)
    return base


@router.post("/groups/classrooms/{rid}/ai-students")
def add_ai_students(rid: str, body: AddAIStudents, request: Request):
    from .orchestrator import DomainError
    from .portal_group_api import actor, roster, roster_hash, teacher_room
    from .storage import append_event

    with transaction() as db:
        teacher = actor(db, request, True)
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
            account_id = str(uuid5(UUID(rid), f"r88-ai-account:{body.action_id}:{index}"))
            membership_id = str(uuid5(UUID(rid), f"r88-ai-member:{account_id}"))
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


@router.post("/groups/classrooms/{rid}/ai-students/clear")
def clear_ai_students(rid: str, body: ClearAIStudents, request: Request):
    from .orchestrator import DomainError
    from .portal_group_api import actor, roster, roster_hash, teacher_room
    from .storage import append_event

    with transaction() as db:
        teacher = actor(db, request, True)
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
                    select(Membership.id)
                    .where(Membership.account_id == profile.account_id)
                    .limit(1)
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


@router.post("/suggestions/other")
async def other_suggestion(body: OtherSuggestionRequest, request: Request):
    from . import service
    from .api import account
    from .contracts import OtherSuggestionResult
    from .provider import ProviderWait
    from .provider_gateway import generate
    from .provider_profiles import resolve_request_chain

    with transaction() as db:
        actor, session = account(db, request, True)
        service.limit(db, f"other-suggestion:{actor.id}", 30, 60)
        room = None
        if body.room_id:
            room, _, _ = service.load(db, body.room_id, actor.id)
        bindings, routing = resolve_request_chain(
            db,
            account=actor,
            session=session,
            role="other_suggestion",
            room=room,
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

    for binding in bindings:
        try:
            result, audit = await generate(
                binding,
                messages,
                OtherSuggestionResult,
                no_delta,
            )
            return {
                "suggestion_text": result["suggestion_text"],
                "suggestion_id": audit.get("request_id")
                or sha256(result["suggestion_text"].encode()).hexdigest()[:16],
                "suggestion_model": audit.get("actual_model"),
                "suggestion_provider": audit.get("provider"),
                "provider_profile_id": audit.get("provider_profile_id"),
                "classroom_owner_id": routing.get("owner_id"),
            }
        except ProviderWait:
            continue
        except Exception:
            continue
    return fallback_other_suggestion(body)
