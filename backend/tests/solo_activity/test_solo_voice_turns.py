"""Voice mode, step 3: a spoken dialogue goes through the same machine and tutor as typing.

The same scripted tutor replies drive one attempt by typing and one by voice: the voice attempt
asks for confirmation, extends and concludes at the same turns, because what the student said is
an ordinary message and the same tutor program judges it (policy.py decides, not the voice
model). On Socrates' side the voice attempt stores what the student heard; the summary readout and
the student's spoken answer are stored as ordinary messages; only a plain yes to a summary heard
in full confirms it, and the stored summary is the one that was read.
"""

import asyncio

from sqlalchemy import select

from app.modules.identity_access.repositories import Account
from app.modules.platform import storage
from app.modules.solo_activity import service
from app.modules.solo_activity import voice_turns as vt
from app.modules.solo_activity.repositories import SoloAttempt, SoloMessage
from app.modules.solo_activity.voice_readout import readout
from tests.solo_activity.test_solo_attempts_api import (
    MET,
    NOT_MET,
    OPENING,
    answer,
    do,
    ok,
    setup,
    start,
)

HEARD = "你說親手造成的不一樣，那如果你什麼都不做呢？"


async def _now(text):
    return text


def said(attempt_id, text, heard=HEARD):
    """One exchange: the student said ``text``; the student heard ``heard`` from Socrates."""
    with storage.transaction() as db:
        prepared = vt.begin_turn(db, _account(db), attempt_id, text, 1_000_000.0)
    return asyncio.run(vt.finish_turn(prepared, _now(heard)))


def answered(attempt_id, step, text, *, heard=None, interrupted=False, asked=0):
    """The student's spoken answer to what Socrates just said (``step.say``)."""
    with storage.transaction() as db:
        out = vt.answer_readout(
            db,
            _account(db),
            attempt_id,
            spoken=step.say,
            heard=step.say if heard is None else heard,
            interrupted=interrupted,
            said=text,
            asked=asked,
            at=1_000_000.0,
        )
    if out.tutor is not None:
        return asyncio.run(vt.finish_turn(out.tutor, _now(HEARD)))
    if out.follow is not None:
        return vt.VoiceStep(view=asyncio.run(service.finish_action(out.follow)))
    return out


def _account(db):
    return db.scalar(select(Account).where(Account.username == "student"))


def messages(attempt_id):
    with storage.transaction() as db:
        rows = db.scalars(
            select(SoloMessage)
            .where(SoloMessage.attempt_id == attempt_id)
            .order_by(SoloMessage.seq)
        ).all()
        return [(m.role, m.text) for m in rows]


def stored_summary(attempt_id):
    with storage.transaction() as db:
        return db.get(SoloAttempt, attempt_id).progress[0]["confirmed_summary"]


def voice_to_confirming(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(OPENING)
    first = said(attempt["id"], "不能主動害人")
    replies.append(MET)
    second = said(attempt["id"], "因為是我親手造成的")
    return attempt["id"], first, second


# ---- the same timing as typing --------------------------------------------------------------


def test_voice_asks_for_confirmation_at_the_same_turn_as_typing(client, tutor):
    _, replies = tutor
    s = setup(client)
    typed = ok(start(client, s["activity_id"]))
    replies.append(OPENING)
    typed_first = answer(client, typed["id"])
    replies.append(MET)
    typed_second = ok(do(client, typed["id"], "send_message", {"text": "因為是我親手造成的"}))

    with storage.transaction() as db:
        db.query(SoloMessage).delete()
        db.query(SoloAttempt).delete()
    spoken = ok(start(client, s["activity_id"]))
    replies.append(OPENING)
    voice_first = said(spoken["id"], "不能主動害人")
    replies.append(MET)
    voice_second = said(spoken["id"], "因為是我親手造成的")

    assert voice_first.view["state"] == typed_first["state"] == "in_dialogue"
    assert voice_second.view["state"] == typed_second["state"] == "confirming"
    # The HTTP layer adds an empty "sources"; the fields themselves are the same.
    typed_summary = {k: v for k, v in typed_second["candidate_summary"].items() if k != "sources"}
    assert voice_second.view["candidate_summary"] == typed_summary
    assert voice_first.say is None
    assert voice_second.say == readout(MET["summary"], "zh-Hant")


def test_socrates_side_stores_what_the_student_heard_not_the_tutor_text(client, tutor):
    attempt_id, _, _ = voice_to_confirming(client, tutor)
    log = messages(attempt_id)
    assert log == [
        ("student", "不能主動害人"),
        ("tutor", HEARD),
        ("student", "因為是我親手造成的"),
        ("tutor", HEARD),
    ]
    assert OPENING["reply_text"] not in [text for _, text in log]


def test_the_tutor_sees_the_dialogue_the_student_had(client, tutor):
    calls, _ = tutor
    voice_to_confirming(client, tutor)
    assert HEARD in calls[1]["messages"][1]["content"]


# ---- confirming by voice ----------------------------------------------------------------------


def test_a_plain_yes_to_a_summary_heard_in_full_confirms_the_summary_that_was_read(client, tutor):
    attempt_id, _, step = voice_to_confirming(client, tutor)
    out = answered(attempt_id, step, "對")
    assert out.view["state"] in ("reviewing", "awaiting_reflection_prompt")
    assert {k: v for k, v in stored_summary(attempt_id).items() if k != "sources"} == MET["summary"]
    assert readout(stored_summary(attempt_id), "zh-Hant") == step.say
    # The readout and the student's yes are ordinary messages the teacher sees.
    assert messages(attempt_id)[-2:] == [("tutor", step.say), ("student", "對")]


def test_an_interrupted_readout_is_not_confirmed_even_by_a_yes(client, tutor):
    _, replies = tutor
    attempt_id, _, step = voice_to_confirming(client, tutor)
    replies.append(NOT_MET)
    out = answered(attempt_id, step, "對", heard=step.say[:12], interrupted=True)
    assert out.view["state"] == "in_dialogue"
    assert stored_summary(attempt_id) is None
    with storage.transaction() as db:
        current = db.get(SoloAttempt, attempt_id).progress[0]
    # Withdrawn, not turned down: no 不太對 is recorded.
    assert current["rejected_summary"] is None and current["rejected_at"] == []


def test_a_readout_the_voice_model_reworded_is_not_confirmed(client, tutor):
    _, replies = tutor
    attempt_id, _, step = voice_to_confirming(client, tutor)
    replies.append(NOT_MET)
    out = answered(attempt_id, step, "對", heard="所以你就是不想拉，對吧？")
    assert out.view["state"] == "in_dialogue"
    assert stored_summary(attempt_id) is None


def test_no_is_turning_the_summary_down_and_the_answer_is_the_next_message(client, tutor):
    calls, replies = tutor
    attempt_id, _, step = voice_to_confirming(client, tutor)
    replies.append(NOT_MET)
    out = answered(attempt_id, step, "不對，我是說後果不重要")
    assert out.view["state"] == "in_dialogue"
    with storage.transaction() as db:
        current = db.get(SoloAttempt, attempt_id).progress[0]
    assert len(current["rejected_at"]) == 1
    assert ("student", "不對，我是說後果不重要") in messages(attempt_id)
    assert "不對，我是說後果不重要" in calls[-1]["messages"][1]["content"]


def test_an_addition_goes_on_as_a_message_without_turning_the_summary_down(client, tutor):
    _, replies = tutor
    attempt_id, _, step = voice_to_confirming(client, tutor)
    replies.append(NOT_MET)
    out = answered(attempt_id, step, "對，但我想補充，如果他是自願的就不一樣")
    assert out.view["state"] == "in_dialogue"
    with storage.transaction() as db:
        current = db.get(SoloAttempt, attempt_id).progress[0]
    assert current["rejected_summary"] is None and current["rejected_at"] == []


def test_an_unclear_answer_is_asked_once_more_then_withdrawn(client, tutor):
    _, replies = tutor
    attempt_id, _, step = voice_to_confirming(client, tutor)
    again = answered(attempt_id, step, "嗯……應該吧")
    assert again.view["state"] == "confirming"
    assert again.say == vt.ASK_AGAIN["zh-Hant"]
    replies.append(NOT_MET)
    out = answered(attempt_id, again, "大概吧", asked=1)
    assert out.view["state"] == "in_dialogue"
    assert stored_summary(attempt_id) is None


def test_a_yes_after_being_asked_again_confirms(client, tutor):
    attempt_id, _, step = voice_to_confirming(client, tutor)
    again = answered(attempt_id, step, "嗯")
    out = answered(attempt_id, again, "對", asked=1)
    assert out.view["state"] in ("reviewing", "awaiting_reflection_prompt")
    assert {k: v for k, v in stored_summary(attempt_id).items() if k != "sources"} == MET["summary"]


def test_words_that_are_not_this_summary_never_confirm(client, tutor):
    _, replies = tutor
    attempt_id, _, step = voice_to_confirming(client, tutor)
    stale = vt.VoiceStep(view=step.view, say="我整理一下：你的立場是要拉桿。這樣整理對嗎？")
    replies.append(NOT_MET)
    out = answered(attempt_id, stale, "對")
    assert out.view["state"] == "in_dialogue"
    assert stored_summary(attempt_id) is None


def test_answering_a_readout_outside_confirming_is_unavailable(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(OPENING)
    said(attempt["id"], "不能主動害人")
    step = vt.VoiceStep(view=None, say="這樣整理對嗎？")
    with storage.transaction() as db:
        try:
            vt.answer_readout(
                db,
                _account(db),
                attempt["id"],
                spoken=step.say,
                heard=step.say,
                interrupted=False,
                said="對",
                asked=0,
                at=1_000_000.0,
            )
        except Exception as exc:  # noqa: BLE001
            assert getattr(exc, "code", None) == "SOLO_ACTION_UNAVAILABLE"
        else:
            raise AssertionError("answering outside confirming must fail")
