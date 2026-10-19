"""Solo-activity attempts: transactions, the provider call, and the student's view.

An action that needs the tutor runs in three steps, like script_assist: Tx1 locks the attempt,
applies the pure transition, saves the student's message and prepares the provider request,
then commits; the provider is awaited outside any transaction; Tx2 locks the attempt again and
applies the result only if it is still the one being waited for (AGENTS.md: 學生訊息先落地才
呼叫 provider). The state machine itself lives in domain/solo_attempt.py.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import asdict
from typing import TYPE_CHECKING, Any, cast
from uuid import uuid4

from sqlalchemy import func, select

from app.modules.ai_providers.api.routes.provider_profiles import (
    record_direct_call_audit,
    resolve_owner_chain,
)
from app.modules.course_management.domain.activity_status import ActivityTimes, status
from app.modules.course_management.repositories.models import (
    Activity,
    ActivityRevision,
    Course,
    Enrollment,
)
from app.modules.course_management.services import activities
from app.modules.course_management.services import enrollment as enrollments
from app.modules.llm_runtime.tutor import classroom_gateway
from app.modules.llm_runtime.tutor.prompts import compile_program
from app.modules.platform.errors import DomainError
from app.modules.platform.repositories.classroom_storage import Account, transaction
from app.modules.platform.services.rate_limit import limit
from app.modules.solo_dialogue.domain import solo_attempt as machine
from app.modules.solo_dialogue.domain.solo_attempt import AttemptState, QuestionProgress
from app.modules.solo_dialogue.domain.solo_outputs import SoloTutorTurn
from app.modules.solo_dialogue.repositories.solo_models import SoloAttempt, SoloMessage

if TYPE_CHECKING:
    from app.modules.solo_dialogue.api.solo_schemas import (
        ConfirmViewpointBody,
        SendMessageBody,
        SubmitStanceBody,
    )

ROLE = "socratic_tutor"
PROGRAM = "solo_tutor"
PROVIDER_TIMEOUT_SECONDS = 130
DEFAULT_TUTOR_GOAL = "協助學生照見自己的立場與理由。"
PRINCIPLE_HINTS = frozenset({"後果主義", "義務論", "混合"})
# Actions in the spec's table whose transition is not built yet: offered, but answered 501.
NOT_READY = frozenset({"submit_review"})
# States after every question is confirmed: the review step (R1) has begun.
REVIEW_STATES = frozenset({"reviewing", "awaiting_reflection_prompt", "reflecting", "completed"})


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
    found = enrollments.existing(db, account, course)
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
        question_index=row.question_index,
        question_count=len(row.progress),
        progress=tuple(QuestionProgress(**entry) for entry in row.progress),
        pending_key=row.pending_key,
        pending_since=row.pending_since,
        notice=cast(Any, row.notice),
    )


def _store(row: SoloAttempt, a: AttemptState) -> None:
    row.state = a.state
    row.question_index = a.question_index
    # Reassign the whole list: SQLAlchemy does not see in-place changes to a JSON column.
    row.progress = [asdict(entry) for entry in a.progress]
    row.pending_key = a.pending_key
    row.pending_since = a.pending_since
    row.notice = a.notice
    row.updated_at = time.time()


def _add_message(db, row: SoloAttempt, role: str, text: str, observations=None) -> None:
    """The attempt row is locked, so the next seq cannot race."""
    last = db.scalar(select(func.max(SoloMessage.seq)).where(SoloMessage.attempt_id == row.id))
    db.add(
        SoloMessage(
            attempt_id=row.id,
            seq=(last or 0) + 1,
            question_index=row.question_index,
            role=role,
            text=text,
            observations=observations,
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
    enrolled = enrollments.existing(db, db.get(Account, row.account_id), course)
    questions = db.get(ActivityRevision, row.revision_id).content["questions"]
    reached = []
    # Questions after question_index never leave the server (AGENTS.md: 未進入的階段不回傳 title).
    for index, (question, progress) in enumerate(zip(questions, a.progress)):
        if index > a.question_index:
            break
        reached.append(
            {
                "index": index,
                "id": question["id"],
                "title": question["title"],
                "scenario": question["scenario"],
                "options": [{"id": o["id"], "text": o["text"]} for o in question["options"]],
                "stance": (
                    {"option_id": progress.option_id, "reason": progress.reason}
                    if progress.option_id is not None
                    else None
                ),
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
        "question_index": a.question_index,
        "question_count": a.question_count,
        "questions": reached,
        "messages": [
            {
                "id": m.id,
                "question_index": m.question_index,
                "role": m.role,
                "text": m.text,
                "created_at": m.created_at,
            }
            for m in _messages(db, row.id)
            if m.question_index <= a.question_index
        ],
        "candidate_summary": a.current.candidate_summary if confirming else None,
        "summary_digest": a.current.summary_digest if confirming else None,
        "principle_hint": label if confirming and label in PRINCIPLE_HINTS else None,
        "revising": a.current.revising,
        "rejected_summary": a.current.rejected_summary if a.current.revising else None,
        "notice": a.notice,
        "available_actions": machine.actions_for(a, at),
    }


def _attempt_brief(row: SoloAttempt, questions: list[dict]) -> dict:
    """C2's progress: titles only for reached questions (AGENTS.md: 未進入的階段不回傳 title)."""
    a = _state(row)
    progress = []
    for index, (question, entry) in enumerate(zip(questions, a.progress)):
        reached = index <= a.question_index
        confirmed = entry.status == "goal_met"
        options = {option["id"]: option["text"] for option in question["options"]}
        progress.append(
            {
                "index": index,
                "status": (
                    "confirmed" if confirmed else "in_dialogue" if reached else "not_started"
                ),
                "title": question["title"] if reached else None,
                "option_label": (
                    options.get(cast(str, entry.final_option_id)) if confirmed else None
                ),
            }
        )
    return {
        "id": row.id,
        "state": a.state,
        "question_index": a.question_index,
        "progress": progress,
        "review_status": "in_progress" if a.state in REVIEW_STATES else "not_started",
        "current_turn": a.current.turn_index,
    }


def activity_view(db, account: Account, activity_id: str, at: float) -> dict:
    activity, revision = _published_activity(db, activity_id)
    course = db.get(Course, activity.course_id)
    _enrollment(db, account, course, "ACTIVITY_NOT_FOUND")
    row = _own_attempt(db, activity.id, account.id)
    if row is not None:
        revision = db.get(ActivityRevision, row.revision_id)
    return {
        "activity_id": activity.id,
        "title": activity.title,
        "course_id": course.id,
        "course_name": course.name,
        "status": _status(activity, at),
        "question_count": len(revision.content["questions"]),
        "ends_at": activity.ends_at,
        "attempt": (
            _attempt_brief(row, revision.content["questions"]) if row is not None else None
        ),
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
    question_ids = [question["id"] for question in revision.content["questions"]]
    _store(row, machine.new_attempt(row.id, question_ids))
    db.add(row)
    db.flush()
    return _attempt_view(db, row, at)


# ---- actions -------------------------------------------------------------------------------


def _tutor_context(db, row: SoloAttempt, a: AttemptState, pending: machine.PendingTurn) -> dict:
    """Only the teacher's question, this student's stance and this question's dialogue."""
    question = db.get(ActivityRevision, row.revision_id).content["questions"][
        pending.question_index
    ]
    progress = a.progress[pending.question_index]
    options = {option["id"]: option["text"] for option in question["options"]}
    messages = [m for m in _messages(db, row.id) if m.question_index == pending.question_index]
    return {
        "question": {
            "title": question["title"],
            "scenario": question["scenario"],
            "options": question["options"],
            "tutor_goal": question.get("follow_up_direction", "").strip() or DEFAULT_TUTOR_GOAL,
        },
        "option_id": progress.option_id,
        "option_text": options.get(cast(str, progress.option_id), ""),
        "argument": progress.reason,
        # The first student message is the stance's reason, already given as argument.
        "history": [{"role": m.role, "text": m.text} for m in messages[1:]],
        "turn_index": pending.turn_index,
    }


def _transition(db, row: SoloAttempt, a: AttemptState, action: str, body, at: float):
    """The pure transition for one action; saves the student's message when there is one."""
    revision = db.get(ActivityRevision, row.revision_id)
    if action == "submit_stance":
        stance = cast("SubmitStanceBody", body)
        question = revision.content["questions"][a.question_index]
        valid = {option["id"] for option in question["options"]}
        new, pending = machine.submit_stance(a, stance.option_id, stance.reason, valid, at)
        _add_message(db, row, "student", stance.reason)
        return new, pending
    if action == "send_message":
        limit(db, f"solo:{row.id}", 20, 60, error_code="RATE_LIMITED")
        new, pending = machine.send_message(a, at)
        _add_message(db, row, "student", cast("SendMessageBody", body).text)
        return new, pending
    if action == "retry":
        limit(db, f"solo:{row.id}", 20, 60, error_code="RATE_LIMITED")
        return machine.retry(a, at)
    if action == "confirm_viewpoint":
        digest = cast("ConfirmViewpointBody", body).summary_digest
        return machine.confirm_viewpoint(a, digest), None
    if action == "revise_viewpoint":
        return machine.revise_viewpoint(a), None
    if action == "next_question":
        return machine.next_question(a), None
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
    messages, schema, _ = compile_program(db, PROGRAM, _tutor_context(db, row, new, pending))
    return {
        "attempt_id": row.id,
        "account_id": account.id,
        "key": pending.key,
        "bindings": bindings,
        "messages": messages,
        "schema": schema,
    }


async def _call_tutor(prepared: dict) -> SoloTutorTurn | None:
    """Each binding in order; every attempt is audited. None when all of them fail."""

    async def no_delta(_):
        return None

    for binding in prepared["bindings"]:
        started = time.monotonic()
        try:
            result, audit = await asyncio.wait_for(
                classroom_gateway.generate(
                    binding, prepared["messages"], prepared["schema"], no_delta
                ),
                PROVIDER_TIMEOUT_SECONDS,
            )
            turn = SoloTutorTurn.model_validate(result)
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
        return turn
    return None


async def finish_action(prepared: dict) -> dict:
    """Provider call, then Tx2. A result for a key no longer awaited changes nothing."""
    if "view" in prepared:
        return prepared["view"]
    turn = await _call_tutor(prepared)
    with transaction() as db:
        account = db.get(Account, prepared["account_id"])
        row = _locked_attempt(db, account, prepared["attempt_id"])
        a = _state(row)
        key = prepared["key"]
        if turn is None:
            new = machine.tutor_failed(a, key, "tutor_unavailable")
        else:
            new = machine.apply_tutor_turn(a, key, turn)
            if new is not None:
                _add_message(db, row, "tutor", turn.reply_text, turn.observations.model_dump())
        if new is not None:
            _store(row, new)
        return _attempt_view(db, row, now())
