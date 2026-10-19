"""The solo-activity state machine as pure functions: old state in, new state out, no I/O.

States, actions and transitions follow the design spec §4.5 table; only the first part of it
is reachable today. Whether a question's dialogue may move to confirmation is decided only by
``orchestrator/policy.py``'s ``should_advance`` (AGENTS.md), called from ``apply_tutor_turn``.

Turn counting matches the group personal dialogue: the call after the stance is turn 0 (the
opening follow-up), and each student message adds one. ``should_advance`` is given the turn
index as its completed-turn count, so its floor keeps turn 0 from ever confirming.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, replace
from typing import Any, NamedTuple

from app.modules.platform.errors import DomainError
from app.modules.solo_dialogue.domain.solo_outputs import SoloTutorTurn
from app.modules.solo_dialogue.domain.solo_types import (
    QuestionStatus,
    SoloAction,
    SoloNotice,
    SoloState,
)
from app.modules.solo_dialogue.orchestrator.policy import should_advance

# A provider call still pending after this long has lost its request; the student may retry.
STALE_SECONDS = 150
# Student messages per question, the stance's reason included.
MESSAGE_LIMIT = 40

_ACTIONS: dict[str, list[SoloAction]] = {
    "choosing_stance": ["submit_stance"],
    "tutor_unavailable": ["retry"],
    "in_dialogue": ["send_message"],
    "confirming": ["confirm_viewpoint", "revise_viewpoint"],
    "between_questions": ["next_question"],
    "reviewing": ["submit_review"],
}


@dataclass(frozen=True)
class QuestionProgress:
    question_id: str
    option_id: str | None = None
    reason: str | None = None
    turn_index: int = 0
    # How many times this turn's provider call has been retried; part of the pending key.
    tries: int = 0
    status: QuestionStatus = "in_progress"
    candidate_summary: dict[str, Any] | None = None
    summary_digest: str | None = None
    principle_label: str | None = None
    # The turn whose observations last reported a position shift; policy.py holds confirmation.
    last_shift_turn: int | None = None
    confirmed_summary: dict[str, Any] | None = None
    final_option_id: str | None = None
    # 不太對 until the next student message; rejected_summary is the summary turned down.
    revising: bool = False
    rejected_summary: dict[str, Any] | None = None


@dataclass(frozen=True)
class AttemptState:
    attempt_id: str
    state: SoloState
    question_index: int
    question_count: int
    progress: tuple[QuestionProgress, ...]
    pending_key: str | None = None
    pending_since: float | None = None
    notice: SoloNotice | None = None

    @property
    def current(self) -> QuestionProgress:
        return self.progress[self.question_index]


class PendingTurn(NamedTuple):
    key: str
    question_index: int
    turn_index: int


def new_attempt(attempt_id: str, question_ids: list[str]) -> AttemptState:
    return AttemptState(
        attempt_id=attempt_id,
        state="choosing_stance",
        question_index=0,
        question_count=len(question_ids),
        progress=tuple(QuestionProgress(question_id=qid) for qid in question_ids),
    )


def actions_for(a: AttemptState, now: float) -> list[SoloAction]:
    if a.state == "awaiting_tutor":
        stale = a.pending_since is not None and now - a.pending_since > STALE_SECONDS
        return ["retry"] if stale else []
    return list(_ACTIONS.get(a.state, []))


def _require(a: AttemptState, action: SoloAction, now: float = 0.0) -> None:
    if action not in actions_for(a, now):
        raise DomainError("SOLO_ACTION_UNAVAILABLE", 409)


def _with_current(a: AttemptState, **changes: Any) -> tuple[QuestionProgress, ...]:
    progress = list(a.progress)
    progress[a.question_index] = replace(a.current, **changes)
    return tuple(progress)


def _await(
    a: AttemptState, progress: tuple[QuestionProgress, ...], now: float
) -> tuple[AttemptState, PendingTurn]:
    current = progress[a.question_index]
    key = f"{a.attempt_id}:{a.question_index}:{current.turn_index}:{current.tries}"
    waiting = replace(
        a,
        state="awaiting_tutor",
        progress=progress,
        pending_key=key,
        pending_since=now,
        notice=None,
    )
    return waiting, PendingTurn(key, a.question_index, current.turn_index)


def submit_stance(
    a: AttemptState, option_id: str, reason: str, valid_option_ids: set[str], now: float
) -> tuple[AttemptState, PendingTurn]:
    _require(a, "submit_stance")
    if option_id not in valid_option_ids:
        raise DomainError("SOLO_OPTION_INVALID", 422)
    progress = _with_current(a, option_id=option_id, reason=reason, turn_index=0, tries=0)
    return _await(a, progress, now)


def send_message(a: AttemptState, now: float) -> tuple[AttemptState, PendingTurn]:
    _require(a, "send_message")
    # The stance's reason plus one message per completed turn.
    if a.current.turn_index + 1 >= MESSAGE_LIMIT:
        raise DomainError("SOLO_MESSAGE_LIMIT", 409)
    progress = _with_current(
        a, turn_index=a.current.turn_index + 1, tries=0, revising=False, rejected_summary=None
    )
    return _await(a, progress, now)


def retry(a: AttemptState, now: float) -> tuple[AttemptState, PendingTurn]:
    """Call the provider again for the same turn; a new key makes the old call's result stale."""
    _require(a, "retry", now)
    return _await(a, _with_current(a, tries=a.current.tries + 1), now)


def summary_digest(
    attempt_id: str, question_index: int, turn_index: int, summary: dict[str, Any]
) -> str:
    raw = json.dumps(
        [attempt_id, question_index, turn_index, summary],
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def _is_pending(a: AttemptState, key: str) -> bool:
    return a.state == "awaiting_tutor" and a.pending_key == key


def apply_tutor_turn(a: AttemptState, key: str, turn: SoloTutorTurn) -> AttemptState | None:
    """The tutor's reply for ``key``; None when it is stale (another key or no longer waiting)."""
    if not _is_pending(a, key):
        return None
    turn_index = a.current.turn_index
    last_shift = turn_index if turn.observations.position_shifted else a.current.last_shift_turn
    settled = replace(
        a,
        progress=_with_current(a, last_shift_turn=last_shift),
        pending_key=None,
        pending_since=None,
        notice=None,
    )
    advance = should_advance(
        turn.observations,
        turn_count=turn_index,
        turns_since_shift=None if last_shift is None else turn_index - last_shift,
    )
    if not advance:
        progress = _with_current(settled, candidate_summary=None, summary_digest=None)
        return replace(settled, state="in_dialogue", progress=progress)
    summary = turn.summary.model_dump()
    progress = _with_current(
        settled,
        candidate_summary=summary,
        summary_digest=summary_digest(
            a.attempt_id, a.question_index, a.current.turn_index, summary
        ),
        principle_label=turn.observations.principle_label,
    )
    return replace(settled, state="confirming", progress=progress)


def tutor_failed(a: AttemptState, key: str, notice: SoloNotice) -> AttemptState | None:
    if not _is_pending(a, key):
        return None
    return replace(
        a, state="tutor_unavailable", pending_key=None, pending_since=None, notice=notice
    )


def confirm_viewpoint(a: AttemptState, digest: str) -> AttemptState:
    """Only the summary currently shown may be confirmed; an older one is stale."""
    _require(a, "confirm_viewpoint")
    current = a.current
    if digest != current.summary_digest:
        raise DomainError("SOLO_SUMMARY_STALE", 409)
    progress = _with_current(
        a,
        status="goal_met",
        confirmed_summary=current.candidate_summary,
        final_option_id=current.option_id,
        candidate_summary=None,
        summary_digest=None,
    )
    more = a.question_index + 1 < a.question_count
    return replace(a, state="between_questions" if more else "reviewing", progress=progress)


def revise_viewpoint(a: AttemptState) -> AttemptState:
    """不太對: back to the dialogue; the turn count stays, so the floor is not reset."""
    _require(a, "revise_viewpoint")
    progress = _with_current(
        a,
        candidate_summary=None,
        summary_digest=None,
        revising=True,
        rejected_summary=a.current.candidate_summary,
    )
    return replace(a, state="in_dialogue", progress=progress)


def next_question(a: AttemptState) -> AttemptState:
    """The next question's dialogue starts from nothing: its own stance, turns and shift."""
    _require(a, "next_question")
    return replace(a, state="choosing_stance", question_index=a.question_index + 1)
