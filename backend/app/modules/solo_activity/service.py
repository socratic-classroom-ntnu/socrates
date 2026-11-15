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
from collections.abc import Callable
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
from app.modules.llm_runtime.contracts import (
    Citation,
    FinalSummary,
    PersonalTutorTurn,
    ScenarioExtension,
)
from app.modules.llm_runtime.service import compile_program, guarded_generate, locate_citation
from app.modules.platform.errors import DomainError
from app.modules.platform.rate_limit import enforce_rate_limit
from app.modules.platform.storage import transaction
from app.modules.solo_activity import attempt_machine as machine
from app.modules.solo_activity.attempt_machine import (
    AttemptState,
    FinalProgress,
    Scenario,
    ScenarioProgress,
)
from app.modules.solo_activity.repositories import SoloAttempt, SoloMessage

# Runs the final summary after the response (the route's BackgroundTasks); None runs it inline.
Defer = Callable[[dict], None]

if TYPE_CHECKING:
    from app.modules.solo_activity.contracts import (
        ConfirmViewpointBody,
        SendMessageBody,
    )

ROLE = "socratic_tutor"
PROGRAM = "solo_tutor"
# Writes the next scenario of a student's sequence; the first one is the teacher's text.
EXTENSION_PROGRAM = "scenario_extension"
# Writes the final summary of the whole attempt from its confirmed stages (O6).
FINAL_PROGRAM = "final_summary"
# The language a student's scenarios are written in when their account names none.
DEFAULT_LOCALE = "zh-Hant"
PROVIDER_TIMEOUT_SECONDS = 130
DEFAULT_TUTOR_GOAL = "協助學生照見自己的立場與理由。"
PRINCIPLE_HINTS = frozenset({"後果主義", "義務論", "混合"})
# The teacher's single input is the first scenario, shown to every student as written.
FIRST_SCENARIO_ID = "s1"
# Actions in the spec's table whose transition is not built yet: offered, but answered 501.
NOT_READY: frozenset[str] = frozenset()
# States after every scenario is confirmed: the review step (R1) has begun.
REVIEW_STATES = frozenset({"reviewing", "awaiting_reflection_prompt", "reflecting", "completed"})


def review_status(state: str) -> str:
    """The review as students and teachers see it: begun, or done once the attempt is completed."""
    if state == "completed":
        return "completed"
    return "in_progress" if state in REVIEW_STATES else "not_started"


def final_status(row: SoloAttempt) -> str | None:
    """How a completed attempt's final summary ended; None before that or when finished without."""
    if row.state != "completed":
        return None
    return (row.final or {}).get("status")


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
        final=FinalProgress(**(row.final or {})),
    )


def _store(row: SoloAttempt, a: AttemptState) -> None:
    row.state = a.state
    row.scenario_index = a.scenario_index
    # Reassign the whole list: SQLAlchemy does not see in-place changes to a JSON column.
    row.progress = [asdict(entry) for entry in a.progress]
    row.pending_key = a.pending_key
    row.pending_since = a.pending_since
    row.notice = a.notice
    row.final = asdict(a.final)
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
                "change": progress.change,
                "answer": progress.answer,
                "status": progress.status,
                "confirmed_summary": progress.confirmed_summary,
            }
        )
    confirming = a.state == "confirming"
    label = a.current.principle_label
    final = a.final
    # The summary while it waits for 對／不太對, and the one kept once completed with one.
    shown = final.summary if a.state == "reflecting" or final.status is not None else None
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
                "final_feedback": bool((m.meta or {}).get("final_feedback")),
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
        "final_summary": _student_final(shown) if shown is not None else None,
        "final_digest": final.digest if a.state == "reflecting" else None,
        "final_status": final.status if a.state == "completed" else None,
        "final_revised": final.rejections > 0,
        "available_actions": machine.actions_for(a, at),
    }


def _student_final(summary: dict) -> dict:
    """What the student reads: never normalized_text (system comparisons only) or stance ids."""
    return {
        "points": summary["points"],
        "trajectory": [
            {key: step[key] for key in ("position", "shift_reason", "sources")}
            for step in summary["trajectory"]
        ],
        "final_position": summary["final_position"],
        "reasoning_style": summary["reasoning_style"],
        "open_question": summary["open_question"],
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
        "review_status": review_status(a.state),
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


def ensure_available(db, account: Account, attempt_id: str, action: str, at: float) -> None:
    """SOLO_ACTION_UNAVAILABLE unless the attempt offers this action now."""
    row = db.get(SoloAttempt, attempt_id)
    if row is None or row.account_id != account.id:
        raise DomainError("SOLO_ATTEMPT_NOT_FOUND", 404)
    if action not in machine.actions_for(_state(row), at):
        raise DomainError("SOLO_ACTION_UNAVAILABLE", 409)


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
    if action == "submit_reflection":
        digest = cast("ConfirmViewpointBody", body).summary_digest
        return machine.submit_reflection(a, digest), None
    if action in NOT_READY and action in machine.actions_for(a, at):
        raise DomainError("SOLO_STEP_NOT_READY", 501)
    raise DomainError("SOLO_ACTION_UNAVAILABLE", 409)


def _final_transition(db, row: SoloAttempt, a: AttemptState, action: str, body, at: float):
    """The two final-summary actions that ask for a summary: they return a final pending call."""
    enforce_rate_limit(db, f"solo:{row.id}", 20, 60, error_code="RATE_LIMITED")
    if action == "retry_reflection_prompt":
        return machine.retry_reflection_prompt(a, at)
    message = cast("SendMessageBody", body)
    if message.revise_hint is not None:
        raise DomainError("SOLO_REVISE_HINT_INVALID", 422)
    new, pending = machine.continue_reflection(a, at)
    # The sentence is the student's own words: kept, and quotable by the next summary.
    _add_message(db, row, "student", message.text, meta={"final_feedback": True})
    return new, pending


def begin_action(db, account: Account, attempt_id: str, action: str, body, at: float) -> dict:
    """Tx1. Returns either the final view or what finish_action needs to call the provider."""
    row = _locked_attempt(db, account, attempt_id)
    if action in ("retry_reflection_prompt", "continue_reflection"):
        new, final_pending = _final_transition(db, row, _state(row), action, body, at)
        if final_pending is None:
            _store(row, new)
            return {"view": _attempt_view(db, row, at)}
        return _prepare_final(db, row, new, final_pending, account, at)
    new, pending = _transition(db, row, _state(row), action, body, at)
    if pending is None:
        _store(row, new)
        if action == "confirm_viewpoint" and new.state == "reviewing":
            if machine.wants_extension(new):
                prepared = _prepare_extension(db, row, new, account)
                if prepared is not None:
                    return prepared
            waiting, final_pending = machine.start_final(new, at)
            return _prepare_final(db, row, waiting, final_pending, account, at)
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


def _prepare_extension(db, row: SoloAttempt, a: AttemptState, account: Account) -> dict | None:
    """What writing this student's next scenario needs; None when there is nobody to write it.

    Only this student's words in this scenario go in, each under a ref the model quotes by.
    """
    activity = db.get(Activity, row.activity_id)
    course = db.get(Course, activity.course_id)
    bindings, _ = resolve_owner_chain(db, course.owner_id, ROLE)
    if not bindings:
        return None
    current = a.current
    said = [
        m
        for m in _messages(db, row.id)
        if m.scenario_index == a.scenario_index and m.role == "student"
    ]
    refs = {f"m{number}": m for number, m in enumerate(said, start=1)}
    context = {
        # A teacher key, as in the tutor's context: the scenario is not student input.
        "scenario": current.text,
        "earlier_scenarios": [item.text for item in a.progress[: a.scenario_index]],
        "confirmed": current.confirmed_summary,
        "student_messages": [{"ref": ref, "text": m.text} for ref, m in refs.items()],
        "output_locale": account.locale or DEFAULT_LOCALE,
    }
    messages, schema, _ = compile_program(db, EXTENSION_PROGRAM, context)
    return {
        "extension": True,
        "attempt_id": row.id,
        "account_id": account.id,
        "bindings": bindings,
        "messages": messages,
        "schema": schema,
        "context": context,
        "message_texts": {ref: (m.id, m.text) for ref, m in refs.items()},
    }


async def _call_program(prepared: dict, kind: str, schema, endpoint: str):
    """Each binding in order, every attempt audited. Returns (validated result, binding), or None
    when none of them gave a usable one: any failure is a missing result, never a stuck student."""

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
                    kind=kind,
                    context=prepared["context"],
                ),
                PROVIDER_TIMEOUT_SECONDS,
            )
            validated = schema.model_validate(result)
        except Exception as exc:  # noqa: BLE001 — see the docstring
            reason = (
                getattr(exc, "reason", None)
                or getattr(exc, "code", None)
                or ("PROVIDER_TIMEOUT" if isinstance(exc, TimeoutError) else type(exc).__name__)
            )
            record_direct_call_audit(
                actor_id=prepared["account_id"],
                endpoint=endpoint,
                role=ROLE,
                binding=binding,
                state="FAILED",
                reason_code=str(reason),
                latency_ms=round((time.monotonic() - started) * 1000),
            )
            continue
        record_direct_call_audit(
            actor_id=prepared["account_id"],
            endpoint=endpoint,
            role=ROLE,
            binding=binding,
            state="READY",
            audit=audit,
        )
        return validated, binding
    return None


def _located(citations, texts: dict) -> list[dict]:
    """The citations that really sit in this student's messages, with where they sit."""
    located = []
    for citation in citations:
        message = texts.get(citation.message_ref)
        if message is None:
            continue
        found = locate_citation(Citation.model_validate(citation), message[0], message[1])
        if found is not None:
            located.append(found.model_dump())
    return located


async def _finish_extension(prepared: dict, defer: Defer | None = None) -> dict:
    """Write the scenario if it is still wanted; either way the student gets the current view.

    The call ran between two transactions, so the attempt is read again: a student who has
    already moved on keeps what they have, and a scenario is stored at most once.
    """
    called = await _call_program(
        prepared, EXTENSION_PROGRAM, ScenarioExtension, "solo.scenario_extension"
    )
    with transaction() as db:
        account = db.get(Account, prepared["account_id"])
        row = _locked_attempt(db, account, prepared["attempt_id"])
        a = _state(row)
        if called is not None and machine.wants_extension(a):
            extension, binding = called
            sources = _located(extension.sources, prepared["message_texts"])
            if sources:  # a scenario that rests on none of the student's words is not written
                made_by = {"provider": binding.get("adapter"), "model": binding.get("model")}
                written = machine.extend(
                    a,
                    f"s{a.scenario_count + 1}",
                    extension.scenario,
                    extension.change.model_dump(),
                    sources,
                    made_by,
                )
                _store(row, written)
                return _attempt_view(db, row, now())
        if a.state != "reviewing":  # moved on meanwhile, or another request started the summary
            return _attempt_view(db, row, now())
        # No next scenario: the review begins, and with it the final summary.
        waiting, pending = machine.start_final(a, now())
        follow = _prepare_final(db, row, waiting, pending, account, now())
    return await finish_action(follow, defer)


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


async def finish_action(prepared: dict, defer: Defer | None = None) -> dict:
    """Provider call, then Tx2. A result for a key no longer awaited changes nothing."""
    if "view" in prepared:
        return prepared["view"]
    if prepared.get("extension"):
        return await _finish_extension(prepared, defer)
    if prepared.get("final"):
        # Two model calls in one request (a scenario that could not be written, then the summary)
        # may outlast the ingress or the browser: the summary is written after the response, and
        # the page re-reads the attempt while it is awaiting_reflection_prompt.
        if defer is not None:
            defer(prepared)
            return prepared["waiting_view"]
        return await _finish_final(prepared)
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


# ---- the final summary (O6) ---------------------------------------------------------------


def _for_model(summary: dict) -> dict:
    """A stored summary as the model reads it back: its own words, without the located quotes."""
    return {
        "points": [point["text"] for point in summary["points"]],
        "trajectory": [
            {"position": step["position"], "shift_reason": step["shift_reason"]}
            for step in summary["trajectory"]
        ],
        "final_position": summary["final_position"],
        "reasoning_style": summary["reasoning_style"],
        "open_question": summary["open_question"],
    }


def _prepare_final(
    db, row: SoloAttempt, waiting: AttemptState, pending: machine.PendingTurn, account, at: float
) -> dict:
    """What writing the final summary needs, or the view when there is nobody to write it.

    The material is every scenario the student reached with the summary they confirmed there,
    and all of this student's own words in this attempt, each under a ref the model quotes by.
    After 不太對 the summary turned down and the student's sentence on it go along as revision.
    """
    activity = db.get(Activity, row.activity_id)
    course = db.get(Course, activity.course_id)
    bindings, _ = resolve_owner_chain(db, course.owner_id, ROLE)
    if not bindings:
        _store(
            row,
            cast(
                AttemptState, machine.final_failed(waiting, pending.key, "owner_provider_missing")
            ),
        )
        return {"view": _attempt_view(db, row, at)}
    _store(row, waiting)
    said = [m for m in _messages(db, row.id) if m.role == "student"]
    refs = {f"m{number}": m for number, m in enumerate(said, start=1)}
    context: dict[str, Any] = {
        # Each scenario is a teacher key (llm_runtime's TEACHER_KEYS), never screened as input.
        "scenarios": [
            _final_material(item) for item in waiting.progress[: waiting.scenario_index + 1]
        ],
        "student_messages": [{"ref": ref, "text": m.text} for ref, m in refs.items()],
        "output_locale": account.locale or DEFAULT_LOCALE,
    }
    rejected = waiting.final.summary
    if waiting.final.rejections and rejected is not None:
        feedback = [m for m in said if (m.meta or {}).get("final_feedback")]
        context["revision"] = {"rejected": _for_model(rejected), "student_says": feedback[-1].text}
    messages, schema, _ = compile_program(db, FINAL_PROGRAM, context)
    return {
        "final": True,
        "waiting_view": _attempt_view(db, row, at),
        "attempt_id": row.id,
        "account_id": account.id,
        "key": pending.key,
        "bindings": bindings,
        "messages": messages,
        "schema": schema,
        "context": context,
        "message_texts": {ref: (m.id, m.text) for ref, m in refs.items()},
    }


def _final_material(item: ScenarioProgress) -> dict[str, Any]:
    """One scenario as the final summary reads it. A capped one carries the summary the student saw
    and acknowledged under capped_summary: not confirmed, so the model gives it less weight."""
    material: dict[str, Any] = {"scenario": item.text, "confirmed": item.confirmed_summary}
    if item.status == "capped" and item.capped_summary is not None:
        material["capped_summary"] = item.capped_summary
    return material


def _stored_final(summary: FinalSummary, texts: dict) -> dict:
    """The summary as kept: every quote replaced by where it sits; quotes not found are dropped."""
    stored = summary.model_dump()
    for point, written in zip(stored["points"], summary.points, strict=True):
        point["sources"] = _located(written.sources, texts)
    for step, written_step in zip(stored["trajectory"], summary.trajectory, strict=True):
        step["sources"] = _located(written_step.sources, texts)
    return stored


async def write_final(prepared: dict) -> None:
    """The final summary after the response: an attempt that is gone (merged into an account,
    say) or a provider that fails leaves nothing to report; the student's page reads the result."""
    try:
        await _finish_final(prepared)
    except DomainError:
        pass


async def _finish_final(prepared: dict) -> dict:
    """Show the written summary if it is still awaited; a failure sends the student to the review."""
    called = await _call_program(prepared, FINAL_PROGRAM, FinalSummary, "solo.final_summary")
    with transaction() as db:
        account = db.get(Account, prepared["account_id"])
        row = _locked_attempt(db, account, prepared["attempt_id"])
        a = _state(row)
        key = prepared["key"]
        if called is None:
            new = machine.final_failed(a, key, "tutor_unavailable")
        else:
            new = machine.apply_final_summary(
                a, key, _stored_final(called[0], prepared["message_texts"])
            )
        if new is not None:
            _store(row, new)
        return _attempt_view(db, row, now())


def final_summaries(db, activity_id: str) -> list[dict]:
    """Every completed attempt's kept final summary in this activity, for the radar.

    status says whether the student confirmed it or turned it down twice (unconfirmed);
    attempts finished without one are left out. Not a route: read inside solo-activity only.
    """
    rows = db.scalars(
        select(SoloAttempt)
        .where(SoloAttempt.activity_id == activity_id, SoloAttempt.state == "completed")
        .order_by(SoloAttempt.created_at, SoloAttempt.id)
    )
    found = []
    for row in rows:
        final = FinalProgress(**(row.final or {}))
        if final.status is None or final.summary is None:
            continue
        found.append(
            {
                "attempt_id": row.id,
                "account_id": row.account_id,
                "status": final.status,
                "summary": final.summary,
            }
        )
    return found
