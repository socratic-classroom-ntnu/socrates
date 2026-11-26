"""Voice mode: one spoken exchange, through the same state machine and tutor as typing.

The voice model (Gemini Live) talks with the student; it decides nothing. Each exchange goes
through the typing path:

- What the student said is sent as an ordinary message, and the same tutor program runs on it
  (in parallel with the voice model's reply), so its observations and candidate summary, and
  policy.py's decision to ask for confirmation, are exactly those typing would get. What is
  stored on Socrates' side is what the student heard (the voice model's transcript), not the
  tutor's own reply text.
- At a confirmation point the backend offers (a scenario's summary, or the final summary), the
  next thing Socrates says is the readout built from that summary (voice_readout). The student's
  spoken answer is judged (voice_judge) and presses one of the two actions offered there, 對 or
  不太對 (voice_confirmation.decide); a summary reached at the message limit is only acknowledged,
  as on the card, with nothing to answer.

``VoiceStep.say`` is what the voice model must say next, word for word; the relay hands it back
as ``spoken`` with the transcript of what was actually heard.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable
from dataclasses import dataclass
from typing import Any, Literal

from sqlalchemy import select

from app.modules.identity_access.repositories import Account
from app.modules.platform.errors import DomainError
from app.modules.platform.storage import transaction
from app.modules.solo_activity import attempt_machine as machine
from app.modules.solo_activity import service
from app.modules.solo_activity.contracts import ConfirmViewpointBody, SendMessageBody
from app.modules.solo_activity.repositories import SoloMessage
from app.modules.solo_activity.voice_confirmation import decide
from app.modules.solo_activity.voice_judge import Judgment
from app.modules.solo_activity.voice_readout import (
    final_parts,
    final_readout,
    readout,
    summary_parts,
)

ASK_AGAIN = {
    "zh-Hant": "想確認一下，這樣整理對嗎？",
    "zh-Hans": "想确认一下，这样整理对吗？",
    "en": "Just to check: is that summary right?",
    "es": "Para confirmar: ¿el resumen es correcto?",
}


@dataclass(frozen=True)
class VoiceStep:
    # The attempt view after the step; None while a tutor call is still to be finished.
    view: dict[str, Any] | None
    # What Socrates says next, word for word (a readout or the question asked again).
    say: str | None = None
    # A tutor call to finish with finish_turn: the student's words went on as a message.
    tutor: dict[str, Any] | None = None
    # What service.finish_action needs after a confirmation: a next scenario or the final.
    follow: dict[str, Any] | None = None


@dataclass(frozen=True)
class Point:
    """A summary the student is asked to confirm, as voice reads it."""

    kind: Literal["scenario", "final"]
    expected: str  # the readout
    parts: list[str]  # the summary's own texts the readout must carry
    summary: dict[str, Any]  # what the judging model reads
    digest: str
    # Reached at the message limit: only 對 is offered, so the summary is acknowledged, not asked.
    capped: bool = False


def locale_of(account: Account) -> str:
    return str(account.locale or service.DEFAULT_LOCALE)


def begin_turn(db: Any, account: Account, attempt_id: str, said: str, at: float) -> dict[str, Any]:
    """Tx1 of one exchange: what the student said, as an ordinary message."""
    prepared: dict[str, Any] = service.begin_action(
        db, account, attempt_id, "send_message", SendMessageBody(text=said), at
    )
    return prepared


async def finish_turn(prepared: dict[str, Any], heard: Awaitable[str]) -> VoiceStep:
    """The tutor call and the voice model's reply run together; then Tx2.

    ``heard`` resolves to the transcript of what the voice model said to the student.
    """
    if "view" in prepared:
        await heard
        return VoiceStep(view=prepared["view"])
    called, heard_text = await asyncio.gather(service._call_tutor(prepared), heard)
    with transaction() as db:
        account = db.get(Account, prepared["account_id"])
        row = service._locked_attempt(db, account, prepared["attempt_id"])
        a = service._state(row)
        key = prepared["key"]
        if called is None:
            new = machine.tutor_failed(a, key, "tutor_unavailable")
        elif called[1]:
            new = machine.apply_pulled_back_turn(a, key)
            if new is not None:
                service._add_message(db, row, "tutor", heard_text)
        else:
            turn = called[0]
            new = machine.apply_tutor_turn(a, key, turn)
            if new is not None:
                service._add_message(
                    db,
                    row,
                    "tutor",
                    heard_text,
                    turn.observations.model_dump(),
                    meta={"move": turn.move},
                )
        if new is not None:
            service._store(row, new)
        view = service._attempt_view(db, row, service.now())
        found = point_of(db, account, prepared["attempt_id"], service.now())
        return VoiceStep(view=view, say=found.expected if found is not None else None)


_SHOWN = ("current_position", "reason_summary", "relevant_conditions", "principle_note")


def point_of(db: Any, account: Account, attempt_id: str, at: float) -> Point | None:
    """The confirmation point the attempt is at now, or None when it is at none."""
    row = service._locked_attempt(db, account, attempt_id)
    a = service._state(row)
    locale = locale_of(account)
    if a.state == "confirming" and a.current.candidate_summary:
        summary = a.current.candidate_summary
        return Point(
            kind="scenario",
            expected=readout(summary, locale),
            parts=summary_parts(summary),
            summary={key: summary.get(key) for key in _SHOWN},
            digest=a.current.summary_digest or "",
            capped="revise_viewpoint" not in machine.actions_for(a, at),
        )
    if a.state == "reflecting" and a.final.summary:
        final = service._student_final(a.final.summary)
        final.pop("points", None)
        for step in final["trajectory"]:
            step.pop("sources", None)
        return Point(
            kind="final",
            expected=final_readout(a.final.summary, locale),
            parts=final_parts(a.final.summary),
            summary=final,
            digest=a.final.digest or "",
        )
    return None


def _note(db: Any, row: Any, audit: dict[str, Any]) -> None:
    """The judgment is kept on the student's answer: why it counted (or not) stays readable."""
    last = db.scalar(
        select(SoloMessage)
        .where(SoloMessage.attempt_id == row.id, SoloMessage.role == "student")
        .order_by(SoloMessage.seq.desc())
        .limit(1)
    )
    if last is not None:
        last.meta = {**(last.meta or {}), "voice_confirmation": audit}
        db.flush()


def acknowledge(
    db: Any, account: Account, attempt_id: str, point: Point, heard: str, at: float
) -> VoiceStep:
    """A summary at the message limit: read, then acknowledged as the card does (stored capped)."""
    row = service._locked_attempt(db, account, attempt_id)
    service._refuse_if_ended(db, row, at)  # #212: nothing is written once the activity has ended
    service._add_message(db, row, "tutor", heard)
    out = service.begin_action(
        db,
        account,
        attempt_id,
        "confirm_viewpoint",
        ConfirmViewpointBody(summary_digest=point.digest),
        at,
    )
    return VoiceStep(view=out.get("view"), follow=None if "view" in out else out)


def answer(
    db: Any,
    account: Account,
    attempt_id: str,
    *,
    point: Point,
    spoken: str,
    heard: str,
    said: str,
    judgment: Judgment,
    asks: int,
    reads: int,
    at: float,
) -> VoiceStep:
    """The student's spoken answer to what Socrates just said at ``point``.

    ``spoken`` is what Socrates was asked to say (the readout, or the question asked again);
    ``heard`` the transcript of what the student heard of it.
    """
    now = point_of(db, account, attempt_id, at)
    if now is None or now.kind != point.kind or now.digest != point.digest:
        raise DomainError("SOLO_ACTION_UNAVAILABLE", 409)
    locale = locale_of(account)
    if spoken == ASK_AGAIN.get(locale, ASK_AGAIN["zh-Hant"]):
        faithful = True  # only asked again after the summary itself reached the student
    elif spoken == point.expected:
        faithful = judgment.faithful
    else:
        faithful = False  # words that are not this summary's readout
    step = decide(
        judgment.verdict, faithful=faithful, vetoed=judgment.vetoed, asks=asks, reads=reads
    )
    if point.kind == "final" and step == "withdraw":
        step = "not_confirmed"  # the final summary cannot be taken back, only written again
    audit = {**judgment.audit(), "faithful": faithful, "decision": step, "point": point.kind}
    row = service._locked_attempt(db, account, attempt_id)
    # #212: 再問一次／再讀一次 write without begin_action, so they check the end here like it does.
    service._refuse_if_ended(db, row, at)
    # What the student heard is stored as said, as typing stores the tutor's reply.
    service._add_message(db, row, "tutor", heard)
    if step in ("ask_again", "read_again"):
        service._add_message(db, row, "student", said, meta={"voice_confirmation": audit})
        again = (
            point.expected if step == "read_again" else ASK_AGAIN.get(locale, ASK_AGAIN["zh-Hant"])
        )
        return VoiceStep(view=service._attempt_view(db, row, at), say=again)
    if step == "confirm":
        service._add_message(db, row, "student", said, meta={"voice_confirmation": audit})
        action = "confirm_viewpoint" if point.kind == "scenario" else "submit_reflection"
        out = service.begin_action(
            db, account, attempt_id, action, ConfirmViewpointBody(summary_digest=point.digest), at
        )
        return VoiceStep(view=out.get("view"), follow=None if "view" in out else out)
    if point.kind == "final":
        # 不太對 on the final summary: the answer is the student's feedback; it is written again,
        # or the attempt ends 未確認 the second time, as on the card.
        out = service.begin_action(
            db, account, attempt_id, "continue_reflection", SendMessageBody(text=said), at
        )
        _note(db, row, audit)
        return VoiceStep(view=out.get("view"), follow=None if "view" in out else out)
    if step == "not_confirmed":
        service.begin_action(db, account, attempt_id, "revise_viewpoint", None, at)
    else:
        a = service._state(row)
        service._store(row, machine.withdraw_viewpoint(a, point.digest))
    # The answer goes on as the student's next message (stored by send_message).
    prepared = begin_turn(db, account, attempt_id, said, at)
    _note(db, row, audit)
    return VoiceStep(view=None, tutor=prepared)
