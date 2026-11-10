"""Solo-activity attempts: transactions, the provider call, and the student's view.

An action that needs the tutor runs in three steps, like script_assist: Tx1 locks the attempt,
applies the pure transition, saves the student's message and prepares the provider request,
then commits; the provider is awaited outside any transaction, through the iron rules
(guarded_generate); Tx2 locks the attempt again and applies the result only if it is still
the one being waited for (AGENTS.md: 學生訊息先落地才呼叫 provider). The state machine itself
lives in attempt_machine.py.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import asdict
from typing import TYPE_CHECKING, Any, cast
from uuid import uuid4

from sqlalchemy import func, select

from app.modules.ai_providers.service import (
    record_direct_call_audit,
    resolve_owner_chain,
)
from app.modules.course_management import service as activities
from app.modules.course_management.contracts import ActivityTimes, status
from app.modules.course_management.repositories import (
    Activity,
    ActivityRevision,
    Course,
    Enrollment,
)
from app.modules.identity_access.repositories import Account
from app.modules.llm_runtime.contracts import PersonalTutorTurn
from app.modules.llm_runtime.service import compile_program, guarded_generate
from app.modules.platform.errors import DomainError
from app.modules.platform.rate_limit import enforce_rate_limit
from app.modules.platform.storage import transaction
from app.modules.solo_activity import attempt_machine as machine
from app.modules.solo_activity.attempt_machine import AttemptState, Scenario, ScenarioProgress
from app.modules.solo_activity.repositories import SoloAttempt, SoloMessage

if TYPE_CHECKING:
    from app.modules.solo_activity.contracts import (
        ConfirmViewpointBody,
        SendMessageBody,
    )

ROLE = "socratic_tutor"
PROGRAM = "solo_tutor"
PROVIDER_TIMEOUT_SECONDS = 130
DEFAULT_TUTOR_GOAL = "協助學生照見自己的立場與理由。"
PRINCIPLE_HINTS = frozenset({"後果主義", "義務論", "混合"})
# The teacher's single input is the first scenario, shown to every student as written.
FIRST_SCENARIO_ID = "s1"
# Actions in the spec's table whose transition is not built yet: offered, but answered 501.
NOT_READY: frozenset[str] = frozenset()
# States after every scenario is confirmed: the review step (R1) has begun.
REVIEW_STATES = frozenset({"reviewing", "awaiting_reflection_prompt", "reflecting", "completed"})
# A scenario's status as the progress strip names it; anything else is still being talked over.
_BRIEF_STATUS = {"goal_met": "confirmed", "capped": "capped"}


def now() -> float:
    """Server clock for every attempt decision; tests replace this, never the request."""
    return time.time()


# ---- loading -------------------------------------------------------------------------------


def _published_activity(db, activity_id: str) -> tuple[Activity, ActivityRevision]:
    """Drafts and deleted activities are indistinguishable from missing ones."""
    activity = activities.get_activity(db, activity_id)
    revision = activities.current_revision(db, activity)
    if activity.published_at is None or revision is None:
        raise DomainError("ACTIVITY_NOT_FOUND", 404)
    return activity, revision


def _enrollment(db, account: Account, course: Course, missing: str) -> Enrollment:
    """Only enrolled students; a course's teacher is not a student of it."""
    found = activities.existing_enrollment(db, account, course)
    if found is None or course.owner_id == account.id:
        raise DomainError(missing, 404)
    return found


def _status(activity: Activity, at: float) -> str:
    return status(cast(ActivityTimes, activity), at)


def _own_attempt(db, activity_id: str, account_id: str) -> SoloAttempt | None:
    return db.scalar(
        select(SoloAttempt).where(
            SoloAttempt.activity_id == activity_id, SoloAttempt.account_id == account_id
        )
    )


def _locked_attempt(db, account: Account, attempt_id: str) -> SoloAttempt:
    """Someone else's attempt is indistinguishable from a missing one, for teachers too."""
    row = db.scalar(
        select(SoloAttempt)
        .where(SoloAttempt.id == attempt_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if row is None or row.account_id != account.id:
        raise DomainError("SOLO_ATTEMPT_NOT_FOUND", 404)
    return row


def _state(row: SoloAttempt) -> AttemptState:
    return AttemptState(
        attempt_id=row.id,
        state=cast(Any, row.state),
        scenario_index=row.scenario_index,
        progress=tuple(ScenarioProgress(**entry) for entry in row.progress),
        pending_key=row.pending_key,
        pending_since=row.pending_since,
        notice=cast(Any, row.notice),
    )


def _store(row: SoloAttempt, a: AttemptState) -> None:
    row.state = a.state
    row.scenario_index = a.scenario_index
    # Reassign the whole list: SQLAlchemy does not see in-place changes to a JSON column.
    row.progress = [asdict(entry) for entry in a.progress]
    row.pending_key = a.pending_key
    row.pending_since = a.pending_since
    row.notice = a.notice
    row.updated_at = time.time()


def _add_message(db, row: SoloAttempt, role: str, text: str, observations=None, meta=None) -> None:
    """The attempt row is locked, so the next seq cannot race."""
    last = db.scalar(select(func.max(SoloMessage.seq)).where(SoloMessage.attempt_id == row.id))
    db.add(
        SoloMessage(
            attempt_id=row.id,
            seq=(last or 0) + 1,
            scenario_index=row.scenario_index,
            role=role,
            text=text,
            observations=observations,
            meta=meta,
        )
    )
    db.flush()


def _messages(db, attempt_id: str) -> list[SoloMessage]:
    return list(
        db.scalars(
            select(SoloMessage)
            .where(SoloMessage.attempt_id == attempt_id)
            .order_by(SoloMessage.seq)
        )
    )


# ---- views ---------------------------------------------------------------------------------


def _attempt_view(db, row: SoloAttempt, at: float) -> dict:
    a = _state(row)
    activity = db.get(Activity, row.activity_id)
    course = db.get(Course, activity.course_id)
    enrolled = activities.existing_enrollment(db, db.get(Account, row.account_id), course)
    reached = []
    # Scenarios after scenario_index never leave the server (AGENTS.md: 未進入的階段不回傳 title).
    for index, progress in enumerate(a.progress):
        if index > a.scenario_index:
            break
        reached.append(
            {
                "index": index,
                "id": progress.scenario_id,
                "text": progress.text,
                "answer": progress.answer,
                "status": progress.status,
                "confirmed_summary": progress.confirmed_summary,
            }
        )
    confirming = a.state == "confirming"
    label = a.current.principle_label
    return {
        "id": row.id,
        "activity_id": activity.id,
        "activity_title": activity.title,
        "course_id": course.id,
        "course_name": course.name,
        "display_name": enrolled.display_name if enrolled else "",
        "state": a.state,
        "scenario_index": a.scenario_index,
        "scenarios": reached,
        "messages": [
            {
                "id": m.id,
                "scenario_index": m.scenario_index,
                "role": m.role,
                "text": m.text,
                "created_at": m.created_at,
                "move": (m.meta or {}).get("move") if m.role == "tutor" else None,
                "revise_hint": (m.meta or {}).get("revise_hint") if m.role == "student" else None,
            }
            for m in _messages(db, row.id)
            if m.scenario_index <= a.scenario_index
        ],
        "candidate_summary": a.current.candidate_summary if confirming else None,
        "summary_digest": a.current.summary_digest if confirming else None,
        "principle_hint": label if confirming and label in PRINCIPLE_HINTS else None,
        "revising": a.current.revising,
        "rejected_summary": a.current.rejected_summary if a.current.revising else None,
        "notice": a.notice,
        "available_actions": machine.actions_for(a, at),
    }


def _attempt_brief(row: SoloAttempt) -> dict:
    """C2's progress: a status per scenario of the sequence so far, never any text."""
    a = _state(row)
    return {
        "id": row.id,
        "state": a.state,
        "scenario_index": a.scenario_index,
        "progress": [
            {
                "index": index,
                "status": _BRIEF_STATUS.get(entry.status, "in_dialogue"),
            }
            for index, entry in enumerate(a.progress)
            if index <= a.scenario_index
        ],
        "review_status": "in_progress" if a.state in REVIEW_STATES else "not_started",
        "current_turn": a.current.turn_index,
    }


def activity_view(db, account: Account, activity_id: str, at: float) -> dict:
    activity, _ = _published_activity(db, activity_id)
    course = db.get(Course, activity.course_id)
    _enrollment(db, account, course, "ACTIVITY_NOT_FOUND")
    row = _own_attempt(db, activity.id, account.id)
    return {
        "activity_id": activity.id,
        "title": activity.title,
        "course_id": course.id,
        "course_name": course.name,
        "status": _status(activity, at),
        "ends_at": activity.ends_at,
        "attempt": _attempt_brief(row) if row is not None else None,
    }


def attempt_view(db, account: Account, attempt_id: str, at: float) -> dict:
    row = db.get(SoloAttempt, attempt_id)
    if row is None or row.account_id != account.id:
        raise DomainError("SOLO_ATTEMPT_NOT_FOUND", 404)
    return _attempt_view(db, row, at)


# ---- starting ------------------------------------------------------------------------------


def start(db, account: Account, activity_id: str, at: float) -> dict:
    """Start or continue; one attempt per student per activity.

    The first attempt locks the revision in this transaction; lock_current_revision holds the
    activity row, so concurrent first starts run one after the other and the second finds the
    first's attempt.
    """
    activity, _ = _published_activity(db, activity_id)
    course = db.get(Course, activity.course_id)
    _enrollment(db, account, course, "ACTIVITY_NOT_FOUND")
    row = _own_attempt(db, activity.id, account.id)
    if row is not None:
        return _attempt_view(db, row, at)
    if _status(activity, at) != "open":
        raise DomainError("ACTIVITY_NOT_OPEN", 409)
    revision = activities.lock_current_revision(db, activity.id)
    row = _own_attempt(db, activity.id, account.id)
    if row is not None:
        return _attempt_view(db, row, at)
    row = SoloAttempt(
        id=str(uuid4()), activity_id=activity.id, revision_id=revision.id, account_id=account.id
    )
    first = Scenario(FIRST_SCENARIO_ID, revision.content["title"])
    _store(row, machine.new_attempt(row.id, [first]))
    db.add(row)
    db.flush()
    return _attempt_view(db, row, at)


# ---- actions -------------------------------------------------------------------------------


def _tutor_context(db, row: SoloAttempt, a: AttemptState, pending: machine.PendingTurn) -> dict:
    """Only this scenario's text, this student's answer and this scenario's dialogue."""
    progress = a.progress[pending.scenario_index]
    messages = [m for m in _messages(db, row.id) if m.scenario_index == pending.scenario_index]
    context = {
        # Teacher keys (llm_runtime's TEACHER_KEYS): never screened as student input.
        "scenario": progress.text,
        "tutor_goal": DEFAULT_TUTOR_GOAL,
        "answer": progress.answer,
        # The first student message is the first answer, already given as answer.
        "history": [{"role": m.role, "text": m.text} for m in messages[1:]],
        "turn_index": pending.turn_index,
    }
    # Keys only when they apply: the prompt ignores a missing key, as in the group dialogue.
    latest = next((m for m in reversed(messages) if m.role == "student"), None)
    hint = (latest.meta or {}).get("revise_hint") if latest is not None else None
    if hint is not None:
        context["revise_hint"] = hint
    return context


def _transition(db, row: SoloAttempt, a: AttemptState, action: str, body, at: float):
    """The pure transition for one action; saves the student's message when there is one."""
    if action == "send_message":
        enforce_rate_limit(db, f"solo:{row.id}", 20, 60, error_code="RATE_LIMITED")
        message = cast("SendMessageBody", body)
        new, pending = machine.send_message(a, message.text, at, revise_hint=message.revise_hint)
        meta = {"revise_hint": message.revise_hint} if message.revise_hint is not None else None
        _add_message(db, row, "student", message.text, meta=meta)
        return new, pending
    if action == "retry":
        enforce_rate_limit(db, f"solo:{row.id}", 20, 60, error_code="RATE_LIMITED")
        return machine.retry(a, at)
    if action == "confirm_viewpoint":
        digest = cast("ConfirmViewpointBody", body).summary_digest
        return machine.confirm_viewpoint(a, digest), None
    if action == "revise_viewpoint":
        return machine.revise_viewpoint(a), None
    if action == "next_scenario":
        return machine.next_scenario(a), None
    if action == "submit_review":
        return machine.submit_review(a), None
    if action in NOT_READY and action in machine.actions_for(a, at):
        raise DomainError("SOLO_STEP_NOT_READY", 501)
    raise DomainError("SOLO_ACTION_UNAVAILABLE", 409)


def begin_action(db, account: Account, attempt_id: str, action: str, body, at: float) -> dict:
    """Tx1. Returns either the final view or what finish_action needs to call the tutor."""
    row = _locked_attempt(db, account, attempt_id)
    new, pending = _transition(db, row, _state(row), action, body, at)
    if pending is None:
        _store(row, new)
        return {"view": _attempt_view(db, row, at)}
    activity = db.get(Activity, row.activity_id)
    course = db.get(Course, activity.course_id)
    bindings, _ = resolve_owner_chain(db, course.owner_id, ROLE)
    if not bindings:
        failed = machine.tutor_failed(new, pending.key, "owner_provider_missing")
        _store(row, cast(AttemptState, failed))
        return {"view": _attempt_view(db, row, at)}
    _store(row, new)
    context = _tutor_context(db, row, new, pending)
    messages, schema, _ = compile_program(db, PROGRAM, context)
    return {
        "attempt_id": row.id,
        "account_id": account.id,
        "key": pending.key,
        "bindings": bindings,
        "messages": messages,
        "schema": schema,
        "context": context,
    }


async def _call_tutor(prepared: dict) -> tuple[PersonalTutorTurn, bool] | None:
    """Each binding in order; every attempt is audited. None when all of them fail.

    The call goes through the iron rules: a reply that breaks them is generated once more,
    and a second failure is replaced by the role's pull-back sentence (docs/IRON-RULES.md).
    The flag says whether that happened; only the visible text is replaced, so the rest of
    such a reply must not be used.
    """

    async def no_delta(_):
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
                PROVIDER_TIMEOUT_SECONDS,
            )
            turn = PersonalTutorTurn.model_validate(result)
        except Exception as exc:  # noqa: BLE001 — any provider failure leaves the turn retryable
            reason = (
                getattr(exc, "reason", None)
                or getattr(exc, "code", None)
                or ("PROVIDER_TIMEOUT" if isinstance(exc, TimeoutError) else type(exc).__name__)
            )
            record_direct_call_audit(
                actor_id=prepared["account_id"],
                endpoint="solo.tutor",
                role=ROLE,
                binding=binding,
                state="FAILED",
                reason_code=str(reason),
                latency_ms=round((time.monotonic() - started) * 1000),
            )
            continue
        record_direct_call_audit(
            actor_id=prepared["account_id"],
            endpoint="solo.tutor",
            role=ROLE,
            binding=binding,
            state="READY",
            audit=audit,
        )
        return turn, audit.get("iron_rules", {}).get("outcome") == "fallback"
    return None


async def finish_action(prepared: dict) -> dict:
    """Provider call, then Tx2. A result for a key no longer awaited changes nothing."""
    if "view" in prepared:
        return prepared["view"]
    called = await _call_tutor(prepared)
    with transaction() as db:
        account = db.get(Account, prepared["account_id"])
        row = _locked_attempt(db, account, prepared["attempt_id"])
        a = _state(row)
        key = prepared["key"]
        if called is None:
            new = machine.tutor_failed(a, key, "tutor_unavailable")
        elif called[1]:
            # Pulled back: show the pull-back sentence, keep nothing else from the reply.
            new = machine.apply_pulled_back_turn(a, key)
            if new is not None:
                _add_message(db, row, "tutor", called[0].reply_text)
        else:
            turn = called[0]
            new = machine.apply_tutor_turn(a, key, turn)
            if new is not None:
                _add_message(
                    db,
                    row,
                    "tutor",
                    turn.reply_text,
                    turn.observations.model_dump(),
                    meta={"move": turn.move},
                )
        if new is not None:
            _store(row, new)
        return _attempt_view(db, row, now())
