"""R88 LLM Student actors, automatic all-AI games, and AI suggestion provenance."""

from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
import json
import os
import time
from typing import Any
from uuid import UUID, uuid5

import httpx
from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String, select
from sqlalchemy.orm import Mapped, mapped_column

from .storage import (
    Account,
    ActionReceipt,
    Base,
    Membership,
    Room,
    digest,
    transaction,
)

OTHER_ID = "__other__"
PERSONAS = [
    {
        "id": "consequence",
        "name": "後果觀察者",
        "values": ["結果", "整體影響"],
        "willingness_to_change": "medium",
        "style": "具體比較每個選項的影響",
    },
    {
        "id": "duty",
        "name": "原則守護者",
        "values": ["責任", "一致原則"],
        "willingness_to_change": "low",
        "style": "先辨認規則，再檢查例外",
    },
    {
        "id": "relationship",
        "name": "關係思考者",
        "values": ["照顧", "親疏關係"],
        "willingness_to_change": "medium",
        "style": "關注具體人物與承擔",
    },
    {
        "id": "fairness",
        "name": "公平檢查者",
        "values": ["公平", "可普遍化"],
        "willingness_to_change": "high",
        "style": "比較角色互換後的判斷",
    },
    {
        "id": "autonomy",
        "name": "自主倡議者",
        "values": ["知情", "選擇權"],
        "willingness_to_change": "medium",
        "style": "詢問誰有權作決定",
    },
    {
        "id": "evidence",
        "name": "證據派",
        "values": ["可驗證事實", "不確定性"],
        "willingness_to_change": "high",
        "style": "先區分事實、推論與價值",
    },
]


class AIStudentProfile(Base):
    __tablename__ = "r88_ai_students"

    account_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("r2_accounts.id"), primary_key=True
    )
    parent_room_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("r2_classroom_runs.id"), index=True
    )
    persona: Mapped[dict] = mapped_column(JSON)
    model: Mapped[str] = mapped_column(String(160), default="openrouter/free")
    seed: Mapped[int] = mapped_column(Integer)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)


class AddAIStudents(BaseModel):
    action_id: str = Field(min_length=8, max_length=100)
    count: int = Field(ge=1, le=40)
    model: str = Field(default="openrouter/free", min_length=1, max_length=160)


class ClearAIStudents(BaseModel):
    action_id: str = Field(min_length=8, max_length=100)


class OtherSuggestionRequest(BaseModel):
    question_id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=300)
    scenario: str = Field(min_length=1, max_length=12000)
    existing_options: list[str] = Field(default_factory=list, max_length=20)


router = APIRouter()


def ensure_other_options(document: dict) -> dict:
    """Return a copy whose every question contains one canonical Other option."""
    value = deepcopy(document)
    for question in value.get("questions", []):
        options = question.setdefault("options", [])
        if any(
            option.get("id") == OTHER_ID or str(option.get("text", "")).strip() == "其他"
            for option in options
        ):
            continue
        options.append({"id": OTHER_ID, "text": "其他"})
    return value


def ensure_other_question(question: dict) -> dict:
    value = {"questions": [deepcopy(question)]}
    return ensure_other_options(value)["questions"][0]


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
                }
            created.append(
                {
                    "account_id": account_id,
                    "membership_id": membership_id,
                    "alias": alias,
                    "persona_id": persona["id"],
                    "model": body.model,
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
def other_suggestion(body: OtherSuggestionRequest, request: Request):
    from .api import account
    from . import service

    with transaction() as db:
        actor, _ = account(db, request, True)
        service.limit(db, f"other-suggestion:{actor.id}", 30, 60)

    key = os.environ.get("OPENROUTER_API_KEY", "")
    if not key:
        return fallback_other_suggestion(body)

    model = os.environ.get("PORTAL_OTHER_SUGGESTION_MODEL", "openrouter/free")
    schema = {
        "name": "OtherSuggestion",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {"suggestion_text": {"type": "string"}},
            "required": ["suggestion_text"],
            "additionalProperties": False,
        },
    }
    payload = {
        "model": model,
        "messages": [
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
        ],
        "stream": False,
        "max_tokens": 200,
        "response_format": {"type": "json_schema", "json_schema": schema},
        "provider": {"require_parameters": True},
    }
    headers = {
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
        "X-Title": "Socrates Other Suggestion",
        "HTTP-Referer": os.environ.get("SOCRATES_PUBLIC_ORIGIN", "http://localhost"),
    }
    try:
        with httpx.Client(timeout=httpx.Timeout(12, connect=5)) as client:
            response = client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                json=payload,
                headers=headers,
            )
            response.raise_for_status()
            raw = response.json()
        content = raw["choices"][0]["message"]["content"]
        data = json.loads(content)
        suggestion = str(data["suggestion_text"]).strip()
        if not suggestion:
            return fallback_other_suggestion(body)
        return {
            "suggestion_text": suggestion[:1000],
            "suggestion_id": raw.get("id") or sha256(content.encode()).hexdigest()[:16],
            "suggestion_model": raw.get("model") or model,
            "suggestion_provider": "openrouter",
        }
    except (httpx.HTTPError, KeyError, ValueError, TypeError):
        return fallback_other_suggestion(body)


def fallback_turn(context: dict) -> dict:
    options = context.get("question", {}).get("options", [])
    persona = context.get("persona", {})
    seed = int(context.get("seed", 0))
    ordinary = [o for o in options if o.get("id") != OTHER_ID] or options
    option = ordinary[seed % len(ordinary)] if ordinary else {"id": OTHER_ID, "text": "其他"}
    values = persona.get("values") or ["公平"]
    reason = (
        f"我選擇「{option.get('text', '其他')}」，因為我先重視{values[0]}，"
        "也願意用其他人的觀點檢查這個判斷。"
    )
    mode = context.get("action_mode", "answer")
    return {
        "action_mode": mode,
        "option_id": option.get("id", OTHER_ID),
        "text": reason,
        "relation": "qualifies",
        "should_confirm": mode in {"viewpoint", "final_reflection"},
    }


def _logical_key(member_id: str, mode: str, marker: str) -> str:
    return f"ai:{member_id}:{mode}:{marker}"


def extend(Native):
    """Add durable LLM Student proposals while the native orchestrator keeps authority."""

    class AIStudentOrchestrator(Native):  # type: ignore[valid-type,misc]
        def job(self, kind, key, context):
            if kind == "llm_student_turn" and any(
                row["kind"] == kind and row["key"] == key for row in self.jobs
            ):
                return
            Native.job(self, kind, key, context)

        def ai_members(self):
            return [
                member_id
                for member_id, member in self.s.get("members", {}).items()
                if member.get("actor_type") == "llm_student"
            ]

        def all_ai(self):
            members = self.s.get("members", {})
            return bool(members) and all(
                member.get("actor_type") == "llm_student" for member in members.values()
            )

        def _speed(self, name):
            defaults = {
                "countdown": 2.0,
                "answering": 45.0,
                "distribution": 2.0,
                "focus": 30.0,
                "focus_summary": 2.0,
                "preview": 2.0,
                "final_reflection": 45.0,
            }
            configured = os.environ.get(
                "PORTAL_AI_" + name.upper() + "_SECONDS",
                os.environ.get("PORTAL_AI_PHASE_SECONDS", str(defaults.get(name, 5.0))),
            )
            return float(configured)

        def phase(self, name, seconds=None):
            result = Native.phase(self, name, seconds)
            if self.all_ai() and seconds is not None:
                speed = max(0.25, self._speed(name))
                self.s["deadline_at"] = self.now + min(float(seconds), speed)
                self.s["due_at"] = self.s["deadline_at"]
                self.emit(
                    "ai_simulation.accelerated",
                    phase=name,
                    deadline_at=self.s["deadline_at"],
                )
            self.schedule_ai()
            return result

        def schedule_ai(self):
            p = self.s.get("portal_group")
            if not p:
                return
            phase = self.s.get("phase")
            current = self.current() if self.s.get("runs") else None
            for member_id in self.ai_members():
                member = self.s["members"][member_id]
                context = {
                    "room_id": p["id"],
                    "member_id": member_id,
                    "persona": member.get("persona", {}),
                    "seed": member.get("persona", {}).get("seed", 0),
                    "model": member.get("model", "openrouter/free"),
                    "phase": phase,
                    "question": self.question() if self.s.get("questions") else {},
                    "arguments": [
                        node
                        for node in p.get("arguments", [])
                        if node.get("visibility") in {"stage", "group_shared"}
                        or node.get("member_id") == member_id
                    ][-20:],
                }
                if phase == "answering" and current and member_id not in current["answers"]:
                    marker = current["id"]
                    context["action_mode"] = "answer"
                    self.job(
                        "llm_student_turn",
                        _logical_key(member_id, "answer", marker),
                        context,
                    )
                elif phase == "focus" and current:
                    focus = self.focus()
                    if (
                        focus
                        and focus["member_id"] == member_id
                        and focus["status"] == "AWAITING_STUDENT"
                    ):
                        context["action_mode"] = "focus"
                        context["focus"] = focus
                        self.job(
                            "llm_student_turn",
                            _logical_key(
                                member_id,
                                "focus",
                                f"{focus['id']}:{focus['turn_index']}",
                            ),
                            context,
                        )
                elif phase == "viewpoint_review":
                    if member_id in p.get("confirmations", {}):
                        continue
                    summary = None
                    try:
                        from .portal_group_domain import person_summary

                        summary = person_summary(self.s, member_id)
                    except (KeyError, ValueError):
                        summary = None
                    context["action_mode"] = "viewpoint"
                    context["summary"] = summary
                    self.job(
                        "llm_student_turn",
                        _logical_key(
                            member_id,
                            "viewpoint",
                            str(self.s.get("question_index", "review")),
                        ),
                        context,
                    )
                elif phase == "final_reflection":
                    context["action_mode"] = "final_reflection"
                    marker = str(p.get("settlement", {}).get("started_at", "final"))
                    self.job(
                        "llm_student_turn",
                        _logical_key(member_id, "final_reflection", marker),
                        context,
                    )

        def tick(self):
            result = Native.tick(self)
            self.schedule_ai()
            return result

        def complete_job(self, kind, key, result, provider):
            if kind != "llm_student_turn":
                if kind == "focused_tutor":
                    focus = self.focus() if self.s.get("focus") else None
                    if (
                        focus
                        and self.s.get("members", {}).get(focus["member_id"], {}).get("actor_type")
                        == "llm_student"
                    ):
                        self.s["members"][focus["member_id"]]["last_seen"] = self.now
                value = Native.complete_job(self, kind, key, result, provider)
                self.schedule_ai()
                return value

            parts = key.split(":", 3)
            if len(parts) < 4:
                return
            _, member_id, mode, _ = parts
            if member_id not in self.s.get("members", {}):
                return
            self.s["members"][member_id]["last_seen"] = self.now
            text = str(result.get("text", "")).strip()[:12000]
            if not text:
                return
            if mode == "answer":
                run = self.current()
                if member_id in run["answers"]:
                    return
                option_ids = {option["id"] for option in self.question()["options"]}
                option_id = result.get("option_id")
                if option_id not in option_ids:
                    option_id = next(iter(option_ids))
                self.command(
                    "answer",
                    {
                        "question_run_id": run["id"],
                        "option_id": option_id,
                        "text": text,
                        "revision": 1,
                        "suggestion": {
                            "suggestion_provider": provider.get("provider"),
                            "suggestion_model": provider.get("actual_model"),
                            "suggestion_accepted": False,
                            "actor_type": "llm_student",
                        },
                    },
                    member_id,
                    False,
                )
            elif mode == "focus":
                focus = self.focus()
                if (
                    focus
                    and focus["member_id"] == member_id
                    and focus["status"] == "AWAITING_STUDENT"
                ):
                    self.command("focus_message", {"text": text}, member_id, False)
            elif mode in {"viewpoint", "final_reflection"}:
                self.command(
                    "group_statement",
                    {
                        "text": text,
                        "parents": [],
                        "relation": result.get("relation", "qualifies"),
                    },
                    member_id,
                    False,
                )
                if mode == "viewpoint" and result.get("should_confirm", True):
                    from .portal_group_domain import person_summary

                    summary = person_summary(self.s, member_id)
                    self.command(
                        "group_ack",
                        {"summary_digest": summary["digest"]},
                        member_id,
                        False,
                    )
            self.emit(
                "ai_student.action",
                member_id=member_id,
                action_mode=mode,
                provider=provider,
            )
            self.schedule_ai()

    AIStudentOrchestrator.__name__ = "GameOrchestrator"
    return AIStudentOrchestrator
