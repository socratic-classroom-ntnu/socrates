"""Writing a narrative activity's stance space with the teacher's own AI connection.

The call runs between two transactions: the first reads the narrative and the connections, the
second keeps the result, after checking again that no attempt has locked the content meanwhile.
A failure of every connection leaves the teacher's current stance space as it was.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from sqlalchemy.orm import Session

from app.modules.ai_providers.service import (
    platform_binding,
    record_direct_call_audit,
    resolve_owner_chain,
)
from app.modules.course_management import activities
from app.modules.course_management.practice import practice_owner
from app.modules.course_management.repositories import Activity, Course
from app.modules.identity_access.repositories import Account
from app.modules.llm_runtime.contracts import ActivityExpansion
from app.modules.llm_runtime.service import compile_program, guarded_generate
from app.modules.platform.errors import DomainError
from app.modules.platform.toggles import toggle_enabled

PROGRAM = "activity_expansion"
# The solo activity's model role: the stance space is read by the same tutor that uses it.
ROLE = "socratic_tutor"
DEFAULT_LOCALE = "zh-Hant"
TIMEOUT_SECONDS = 130


def _bindings(db: Session, course: Course) -> list[dict[str, Any]]:
    """The course teacher's default then fallback connection; the 系統 AI only when those leave
    nothing usable and the 後台 switch allows it — the same rule as the solo activity's tutor."""
    bindings: list[dict[str, Any]]
    bindings, _ = resolve_owner_chain(db, course.owner_id, ROLE)
    if bindings or not toggle_enabled(db, "system_ai_fallback"):
        return bindings
    system = platform_binding(db, practice_owner(db).id, ROLE)
    return [system] if system is not None else []


def prepare(db: Session, teacher: Account, activity: Activity, at: float) -> dict[str, Any]:
    narrative = activities.narrative_for_expansion(db, activity, at)
    course = db.get(Course, activity.course_id)
    bindings = _bindings(db, course) if course is not None else []
    if not bindings:
        raise DomainError("EXPANSION_UNAVAILABLE", 424)
    context = {"narrative": narrative, "output_locale": teacher.locale or DEFAULT_LOCALE}
    messages, schema, _ = compile_program(db, PROGRAM, context)
    return {
        "account_id": teacher.id,
        "bindings": bindings,
        "messages": messages,
        "schema": schema,
        "context": context,
    }


async def write(prepared: dict[str, Any]) -> ActivityExpansion:
    """Each connection in order, every attempt audited; EXPANSION_UNAVAILABLE when none gives one."""

    async def no_delta(_: str) -> None:
        return None

    for binding in prepared["bindings"]:
        started = time.monotonic()
        try:
            result, audit = await asyncio.wait_for(
                guarded_generate(
                    binding,
                    prepared["messages"],
                    prepared["schema"],
                    no_delta,
                    kind=PROGRAM,
                    context=prepared["context"],
                ),
                TIMEOUT_SECONDS,
            )
            expansion = ActivityExpansion.model_validate(result)
        except Exception as exc:  # noqa: BLE001 — any failure moves on to the next connection
            reason = (
                getattr(exc, "reason", None)
                or getattr(exc, "code", None)
                or ("PROVIDER_TIMEOUT" if isinstance(exc, TimeoutError) else type(exc).__name__)
            )
            record_direct_call_audit(
                actor_id=prepared["account_id"],
                endpoint="activity.expansion",
                role=ROLE,
                binding=binding,
                state="FAILED",
                reason_code=str(reason),
                latency_ms=round((time.monotonic() - started) * 1000),
            )
            continue
        record_direct_call_audit(
            actor_id=prepared["account_id"],
            endpoint="activity.expansion",
            role=ROLE,
            binding=binding,
            state="READY",
            audit=audit,
        )
        return expansion
    raise DomainError("EXPANSION_UNAVAILABLE", 424)
