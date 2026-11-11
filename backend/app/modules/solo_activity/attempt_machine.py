"""The solo-activity state machine as pure functions: old state in, new state out, no I/O.

States, actions and transitions follow the design spec §4.5 table; only the first part of it
is reachable today. The student answers each scenario in their own words: there are no options.
An attempt walks a sequence of scenarios; the sequence is the length of ``progress`` and may
grow, so nothing here assumes the count is known when the attempt starts. Whether a scenario's
dialogue may move to confirmation is decided only by ``llm_runtime/policy.py``'s
``should_advance`` (AGENTS.md), called from ``apply_tutor_turn``; whether the sequence goes on
or ends after a confirmation is decided only by its ``should_conclude``, called from
``confirm_viewpoint``.

Turn counting matches the group personal dialogue: the call after the first answer is turn 0
(the opening follow-up), and each student message adds one. ``should_advance`` is given the turn
index as its completed-turn count, so its floor keeps turn 0 from ever confirming.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, replace
from typing import Any, NamedTuple

from app.modules.llm_runtime.contracts import PersonalTutorTurn
from app.modules.llm_runtime.service import should_advance, should_conclude
from app.modules.platform.errors import DomainError
from app.modules.solo_activity.contracts import (
    ReviseHint,
    ScenarioStatus,
    SoloAction,
    SoloNotice,
    SoloState,
)

# A provider call still pending after this long has lost its request; the student may retry.
STALE_SECONDS = 150
# Student messages per scenario, the first answer included.
MESSAGE_LIMIT = 40

_ACTIONS: dict[str, list[SoloAction]] = {
    "answering": ["send_message"],
    "tutor_unavailable": ["retry"],
    "in_dialogue": ["send_message"],
    "confirming": ["confirm_viewpoint", "revise_viewpoint"],
    "between_scenarios": ["next_scenario"],
    "reviewing": ["submit_review"],
}


class Scenario(NamedTuple):
    """One scenario of the sequence: the text the student reads, shown verbatim."""

    scenario_id: str
    text: str


@dataclass(frozen=True)
class ScenarioProgress:
    scenario_id: str
    text: str
    # The student's first answer to this scenario, in their own words.
    answer: str | None = None
    turn_index: int = 0
    # How many times this turn's provider call has been retried; part of the pending key.
    tries: int = 0
    status: ScenarioStatus = "in_progress"
    candidate_summary: dict[str, Any] | None = None
    summary_digest: str | None = None
    principle_label: str | None = None
    # The turn whose observations last reported a position shift; policy.py holds confirmation.
    last_shift_turn: int | None = None
    confirmed_summary: dict[str, Any] | None = None
    # 不太對 until the next student message; rejected_summary is the summary turned down.
    revising: bool = False
    rejected_summary: dict[str, Any] | None = None
    # The turn of the first student message after the latest 不太對; policy.py holds confirmation.
    last_revise_turn: int | None = None
    # Only a written (not the teacher's) scenario: the one condition it changed, the student's
    # words it tests (message id and where the quote sits), and which provider and model wrote it.
    change: dict[str, str] | None = None
    sources: list[dict[str, Any]] | None = None
    generated_by: dict[str, Any] | None = None


@dataclass(frozen=True)
class AttemptState:
    attempt_id: str
    state: SoloState
    scenario_index: int
    progress: tuple[ScenarioProgress, ...]
    pending_key: str | None = None
    pending_since: float | None = None
    notice: SoloNotice | None = None

    @property
    def current(self) -> ScenarioProgress:
        return self.progress[self.scenario_index]

    @property
    def scenario_count(self) -> int:
        return len(self.progress)


class PendingTurn(NamedTuple):
    key: str
    scenario_index: int
    turn_index: int


def new_attempt(attempt_id: str, scenarios: list[Scenario]) -> AttemptState:
    return AttemptState(
        attempt_id=attempt_id,
        state="answering",
        scenario_index=0,
        progress=tuple(ScenarioProgress(item.scenario_id, item.text) for item in scenarios),
    )


def _can_still_talk(current: ScenarioProgress) -> bool:
    """Whether the student may send another message in this scenario (the answer counts as one)."""
    return current.turn_index + 1 < MESSAGE_LIMIT


def actions_for(a: AttemptState, now: float) -> list[SoloAction]:
    if a.state == "awaiting_tutor":
        stale = a.pending_since is not None and now - a.pending_since > STALE_SECONDS
        return ["retry"] if stale else []
    if a.state == "confirming" and not _can_still_talk(a.current):
        # 不太對 leads back to a dialogue with no message left in it: only confirming is offered.
        return ["confirm_viewpoint"]
    return list(_ACTIONS.get(a.state, []))


def _require(a: AttemptState, action: SoloAction, now: float = 0.0) -> None:
    if action not in actions_for(a, now):
        raise DomainError("SOLO_ACTION_UNAVAILABLE", 409)


def _with_current(a: AttemptState, **changes: Any) -> tuple[ScenarioProgress, ...]:
    progress = list(a.progress)
    progress[a.scenario_index] = replace(a.current, **changes)
    return tuple(progress)


def _await(
    a: AttemptState, progress: tuple[ScenarioProgress, ...], now: float
) -> tuple[AttemptState, PendingTurn]:
    current = progress[a.scenario_index]
    key = f"{a.attempt_id}:{a.scenario_index}:{current.turn_index}:{current.tries}"
    waiting = replace(
        a,
        state="awaiting_tutor",
        progress=progress,
        pending_key=key,
        pending_since=now,
        notice=None,
    )
    return waiting, PendingTurn(key, a.scenario_index, current.turn_index)


def send_message(
    a: AttemptState, text: str, now: float, revise_hint: ReviseHint | None = None
) -> tuple[AttemptState, PendingTurn]:
    """One student message. The first one in a scenario is the answer, in the student's own words
    (kept as ``answer``); the opening follow-up it triggers is turn 0. While revising a message
    may say which part of the turned-down summary was wrong (revise_hint)."""
    _require(a, "send_message")
    current = a.current
    if a.state == "answering":
        if revise_hint is not None:
            raise DomainError("SOLO_REVISE_HINT_INVALID", 422)
        return _await(a, _with_current(a, answer=text, turn_index=0, tries=0), now)
    if revise_hint is not None and not current.revising:
        raise DomainError("SOLO_REVISE_HINT_INVALID", 422)
    # The first answer plus one message per completed turn.
    if not _can_still_talk(current):
        raise DomainError("SOLO_MESSAGE_LIMIT", 409)
    turn_index = current.turn_index + 1
    progress = _with_current(
        a,
        turn_index=turn_index,
        tries=0,
        revising=False,
        rejected_summary=None,
        last_revise_turn=turn_index if current.revising else current.last_revise_turn,
    )
    return _await(a, progress, now)


def retry(a: AttemptState, now: float) -> tuple[AttemptState, PendingTurn]:
    """Call the provider again for the same turn; a new key makes the old call's result stale."""
    _require(a, "retry", now)
    return _await(a, _with_current(a, tries=a.current.tries + 1), now)


def summary_digest(
    attempt_id: str, scenario_index: int, turn_index: int, summary: dict[str, Any]
) -> str:
    raw = json.dumps(
        [attempt_id, scenario_index, turn_index, summary],
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def _is_pending(a: AttemptState, key: str) -> bool:
    return a.state == "awaiting_tutor" and a.pending_key == key


def apply_tutor_turn(a: AttemptState, key: str, turn: PersonalTutorTurn) -> AttemptState | None:
    """The tutor's reply for ``key``; None when it is stale (another key or no longer waiting)."""
    if not _is_pending(a, key):
        return None
    turn_index = a.current.turn_index
    last_shift = turn_index if turn.observations.position_shifted else a.current.last_shift_turn
    last_revise = a.current.last_revise_turn
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
        turns_since_revise=None if last_revise is None else turn_index - last_revise,
    )
    # Out of messages without a settled view: the current summary goes to confirmation as capped.
    capped = not advance and not _can_still_talk(a.current)
    if not advance and not capped:
        progress = _with_current(settled, candidate_summary=None, summary_digest=None)
        return replace(settled, state="in_dialogue", progress=progress)
    summary = turn.summary.model_dump()
    progress = _with_current(
        settled,
        **({"status": "capped"} if capped else {}),
        candidate_summary=summary,
        summary_digest=summary_digest(
            a.attempt_id, a.scenario_index, a.current.turn_index, summary
        ),
        principle_label=turn.observations.principle_label,
    )
    return replace(settled, state="confirming", progress=progress)


def apply_pulled_back_turn(a: AttemptState, key: str) -> AttemptState | None:
    """The reply for ``key`` broke the iron rules twice and was replaced by the pull-back
    sentence: nothing the model reported is trusted, so the scenario stays in dialogue.
    None when it is stale."""
    if not _is_pending(a, key):
        return None
    settled = replace(a, pending_key=None, pending_since=None, notice=None)
    if not _can_still_talk(a.current):
        # No message left and nothing trustworthy to confirm: the scenario ends capped.
        capped = replace(
            settled,
            progress=_with_current(
                settled, status="capped", candidate_summary=None, summary_digest=None
            ),
        )
        return replace(capped, state=_after_confirmation(capped))
    progress = _with_current(settled, candidate_summary=None, summary_digest=None)
    return replace(settled, state="in_dialogue", progress=progress)


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
    # A capped summary is only acknowledged: never a confirmed viewpoint, never goal_met.
    capped = current.status == "capped"
    progress = _with_current(
        a,
        status="capped" if capped else "goal_met",
        confirmed_summary=None if capped else current.candidate_summary,
        candidate_summary=None,
        summary_digest=None,
    )
    confirmed = replace(a, progress=progress)
    return replace(confirmed, state=_after_confirmation(confirmed))


def _after_confirmation(a: AttemptState) -> SoloState:
    """The rule decides whether the sequence ends; the list only says whether a next scenario
    exists. Until extended scenarios are produced there may be none even when the rule wants one,
    and the student then goes to the review rather than waiting for a scenario that is not coming.
    """
    confirmed = sum(item.status == "goal_met" for item in a.progress)
    if should_conclude(confirmed, shifted_in_latest=a.current.last_shift_turn is not None):
        return "reviewing"
    has_next = a.scenario_index + 1 < a.scenario_count
    return "between_scenarios" if has_next else "reviewing"


def wants_extension(a: AttemptState) -> bool:
    """After the last scenario's confirmation: the rule asks for another one, and none is left.

    The pure confirmation above sends such a student to the review; whoever can write a scenario
    asks this next, so a scenario that cannot be written costs the student nothing.
    """
    current = a.current
    if a.state != "reviewing" or a.scenario_index + 1 < a.scenario_count:
        return False
    if current.status != "goal_met":  # nothing confirmed to build on
        return False
    confirmed = sum(item.status == "goal_met" for item in a.progress)
    return not should_conclude(confirmed, shifted_in_latest=current.last_shift_turn is not None)


def extend(
    a: AttemptState,
    scenario_id: str,
    text: str,
    change: dict[str, str],
    sources: list[dict[str, Any]],
    generated_by: dict[str, Any],
) -> AttemptState:
    """Append the written scenario; the student moves on to it with ``next_scenario``."""
    if not wants_extension(a):
        raise DomainError("SOLO_ACTION_UNAVAILABLE", 409)
    added = ScenarioProgress(
        scenario_id, text, change=change, sources=sources, generated_by=generated_by
    )
    return replace(a, state="between_scenarios", progress=(*a.progress, added))


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


def next_scenario(a: AttemptState) -> AttemptState:
    """The next scenario's dialogue starts from nothing: its own answer, turns and shift."""
    _require(a, "next_scenario")
    return replace(a, state="answering", scenario_index=a.scenario_index + 1)


def submit_review(a: AttemptState) -> AttemptState:
    """After the last confirmed scenario the review is sent and the attempt is completed."""
    _require(a, "submit_review")
    return replace(a, state="completed")
