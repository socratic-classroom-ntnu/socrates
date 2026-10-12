"""R88 LLM Student actors, automatic all-AI games, and AI suggestion provenance."""

from __future__ import annotations

from copy import deepcopy
import time

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.classroom_env import env_str
from app.repositories.classroom_storage import (
    Base,
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
    __tablename__ = "ai_students"

    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), primary_key=True)
    parent_room_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("classroom_runs.id"), index=True
    )
    persona: Mapped[dict] = mapped_column(JSON)
    model: Mapped[str] = mapped_column(String(160), default="openrouter/free")
    provider_profile_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("provider_profiles.id"), nullable=True
    )
    seed: Mapped[int] = mapped_column(Integer)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)


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
            configured = env_str(
                "CLASSROOM_AI_" + name.upper() + "_SECONDS",
                env_str("CLASSROOM_AI_PHASE_SECONDS", str(defaults.get(name, 5.0))),
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
            p = self.s.get("group")
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
                    "provider_profile_id": member.get("provider_profile_id"),
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
                        from app.domain.group_run import person_summary

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
                    from app.domain.group_run import person_summary

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
