"""Voice mode: one spoken exchange, through the same state machine and tutor as typing.

The voice model (Gemini Live) talks with the student; it decides nothing. Each exchange goes
through the typing path:

- What the student said is sent as an ordinary message, and the same tutor program runs on it
  (in parallel with the voice model's reply), so its observations and candidate summary, and
  policy.py's decision to ask for confirmation, are exactly those typing would get. What is
  stored on Socrates' side is what the student heard (the voice model's transcript), not the
  tutor's own reply text.
- When the attempt reaches confirming, the next thing Socrates says is the readout built from the
  candidate summary (voice_readout). The student's spoken answer is sorted (voice_answer) and
  turned into one step (voice_confirmation.decide): 對, 不太對, withdrawn, asked again, or the card.

``VoiceStep.say`` is what the voice model must say next, word for word; the relay hands it back
as ``spoken`` with the transcript of what was actually heard.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable
from dataclasses import dataclass
from typing import Any

from app.modules.identity_access.repositories import Account
from app.modules.platform.errors import DomainError
from app.modules.platform.storage import transaction
from app.modules.solo_activity import attempt_machine as machine
from app.modules.solo_activity import service
from app.modules.solo_activity.contracts import ConfirmViewpointBody, SendMessageBody
from app.modules.solo_activity.voice_answer import classify
from app.modules.solo_activity.voice_confirmation import decide
from app.modules.solo_activity.voice_readout import heard_as_read, readout, summary_parts

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
    # Voice cannot settle the summary: the student presses the card, as when typing.
    to_card: bool = False


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
        say = None
        if new is not None and new.state == "confirming" and new.current.candidate_summary:
            say = readout(new.current.candidate_summary, locale_of(account))
        return VoiceStep(view=view, say=say)


def answer_readout(
    db: Any,
    account: Account,
    attempt_id: str,
    *,
    spoken: str,
    heard: str,
    interrupted: bool,
    said: str,
    asked: int,
    at: float,
) -> VoiceStep:
    """The student's spoken answer to the summary Socrates just read (or asked about again).

    ``spoken`` is the step's ``say``; ``heard`` the transcript of what the student heard of it;
    ``asked`` how many times the question has been asked again for this summary.
    """
    row = service._locked_attempt(db, account, attempt_id)
    a = service._state(row)
    if a.state != "confirming" or not a.current.candidate_summary:
        raise DomainError("SOLO_ACTION_UNAVAILABLE", 409)
    locale = locale_of(account)
    summary = a.current.candidate_summary
    digest = a.current.summary_digest or ""
    expected = readout(summary, locale)
    if spoken == expected:
        heard_in_full = not interrupted and heard_as_read(expected, heard, summary_parts(summary))
    elif spoken == ASK_AGAIN.get(locale, ASK_AGAIN["zh-Hant"]):
        # Only asked again after the summary itself was heard in full.
        heard_in_full = True
    else:
        # Words that are not this summary's readout (an older summary, or anything else).
        heard_in_full = False
    can_talk = "revise_viewpoint" in machine.actions_for(a, at)
    step = decide(
        classify(said, locale),
        heard_in_full=heard_in_full,
        unclear_asks=asked,
        can_still_talk=can_talk,
    )
    # What the student heard is stored as said, as typing stores the tutor's reply.
    service._add_message(db, row, "tutor", heard)
    if step == "confirm":
        service._add_message(db, row, "student", said)
        out = service.begin_action(
            db,
            account,
            attempt_id,
            "confirm_viewpoint",
            ConfirmViewpointBody(summary_digest=digest),
            at,
        )
        return VoiceStep(view=out.get("view"), follow=None if "view" in out else out)
    if step == "ask_again":
        service._add_message(db, row, "student", said)
        again = ASK_AGAIN.get(locale, ASK_AGAIN["zh-Hant"]) if heard_in_full else expected
        return VoiceStep(view=service._attempt_view(db, row, at), say=again)
    if step == "show_card":
        service._add_message(db, row, "student", said)
        return VoiceStep(view=service._attempt_view(db, row, at), to_card=True)
    if step == "revise":
        service.begin_action(db, account, attempt_id, "revise_viewpoint", None, at)
    else:
        service._store(row, machine.withdraw_viewpoint(a, digest))
    # The answer goes on as the student's next message (stored by send_message).
    return VoiceStep(view=None, tutor=begin_turn(db, account, attempt_id, said, at))
