"""Voice mode: a spoken dialogue goes through the same machine and tutor as typing.

The same scripted tutor replies drive one attempt by typing and one by voice: the voice attempt
asks for confirmation, extends and concludes at the same turns, because what the student said is
an ordinary message and the same tutor program judges it (policy.py decides, not the voice
model). On Socrates' side the voice attempt stores what the student heard; the summary readout and
the student's spoken answer are stored as ordinary messages. At each confirmation point (a
scenario's summary, the final summary) a model judges the spoken answer, the word list helps, and
the answer presses 對 or 不太對 as the card would; a summary at the message limit is acknowledged.
"""

import asyncio

import pytest

from sqlalchemy import select

from app.modules.identity_access.repositories import Account
from app.modules.platform import storage
from app.modules.platform.errors import DomainError
from app.modules.solo_activity import service
from app.modules.solo_activity import voice_relay as vr
from app.modules.solo_activity import voice_judge as vj
from app.modules.solo_activity import voice_turns as vt
from app.modules.solo_activity.repositories import SoloAttempt, SoloMessage
from app.modules.solo_activity.voice_readout import readout
from tests.solo_activity.test_solo_ended_activity import end_now
from tests.solo_activity.test_solo_voice_relay import voice_on  # noqa: F401  (fixture)
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


NO_MODEL = RuntimeError("no judging model")


def judged(verdict="agree", quote="對", faithful=True):
    return {"faithful": faithful, "verdict": verdict, "quote": quote}


def answered(
    attempt_id,
    step,
    text,
    replies,
    *,
    model=NO_MODEL,
    heard=None,
    interrupted=False,
    asks=0,
    reads=0,
    at=1_000_000.0,
):
    """The student's spoken answer to what Socrates just said (``step.say``).

    ``model`` is what the judging model replies; by default it fails and the word list judges.
    """
    heard = step.say if heard is None else heard
    replies.insert(0, model)
    with storage.transaction() as db:
        point = vt.point_of(db, _account(db), attempt_id, 1_000_000.0)
        prepared = vj.prepare(
            db, _account(db), attempt_id, summary=point.summary, heard=heard, said=text, at=at
        )
    judgment = asyncio.run(
        vj.judge(
            prepared,
            expected=point.expected,
            parts=point.parts,
            heard=heard,
            interrupted=interrupted,
            said=text,
            locale="zh-Hant",
        )
    )
    with storage.transaction() as db:
        out = vt.answer(
            db,
            _account(db),
            attempt_id,
            point=point,
            spoken=step.say,
            heard=heard,
            said=text,
            judgment=judgment,
            asks=asks,
            reads=reads,
            at=at,
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


def last_student_meta(attempt_id):
    with storage.transaction() as db:
        rows = db.scalars(
            select(SoloMessage)
            .where(SoloMessage.attempt_id == attempt_id, SoloMessage.role == "student")
            .order_by(SoloMessage.seq)
        ).all()
        return rows[-1].meta or {}


def current(attempt_id):
    with storage.transaction() as db:
        return db.get(SoloAttempt, attempt_id).progress[0]


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


# ---- confirming a scenario's summary by voice -----------------------------------------------


def test_the_models_yes_to_a_summary_read_as_written_confirms_the_summary_that_was_read(
    client, tutor
):
    _, replies = tutor
    attempt_id, _, step = voice_to_confirming(client, tutor)
    out = answered(attempt_id, step, "對", replies, model=judged())
    assert out.view["state"] in ("reviewing", "awaiting_reflection_prompt")
    assert {k: v for k, v in stored_summary(attempt_id).items() if k != "sources"} == MET["summary"]
    assert readout(stored_summary(attempt_id), "zh-Hant") == step.say
    # The readout and the student's yes are ordinary messages the teacher sees.
    assert messages(attempt_id)[-2:] == [("tutor", step.say), ("student", "對")]


def test_why_it_counted_is_kept_on_the_students_answer(client, tutor):
    _, replies = tutor
    attempt_id, _, step = voice_to_confirming(client, tutor)
    answered(attempt_id, step, "對啊，就是這樣", replies, model=judged(quote="就是這樣"))
    note = last_student_meta(attempt_id)["voice_confirmation"]
    assert note["verdict"] == "agree" and note["quote"] == "就是這樣"
    assert note["source"] == "model" and note["decision"] == "confirm"


def test_without_a_model_the_word_list_judges(client, tutor):
    _, replies = tutor
    attempt_id, _, step = voice_to_confirming(client, tutor)
    out = answered(attempt_id, step, "對", replies)
    assert out.view["state"] in ("reviewing", "awaiting_reflection_prompt")
    assert last_student_meta(attempt_id)["voice_confirmation"]["source"] == "word_list"


def test_a_reworded_reading_that_kept_the_meaning_is_enough(client, tutor):
    _, replies = tutor
    attempt_id, _, step = voice_to_confirming(client, tutor)
    reworded = "我幫你整理：你不會拉，因為那是你親手造成的。這樣對嗎？"
    out = answered(attempt_id, step, "對", replies, model=judged(), heard=reworded)
    assert out.view["state"] in ("reviewing", "awaiting_reflection_prompt")
    assert stored_summary(attempt_id) is not None


def test_a_reading_that_bent_the_meaning_is_read_again_then_taken_back(client, tutor):
    _, replies = tutor
    attempt_id, _, step = voice_to_confirming(client, tutor)
    bent = "所以你就是不想負責，對吧？"
    again = answered(attempt_id, step, "對", replies, model=judged(faithful=False), heard=bent)
    assert again.view["state"] == "confirming" and again.say == step.say
    replies.append(NOT_MET)
    out = answered(
        attempt_id, again, "對", replies, model=judged(faithful=False), heard=bent, reads=1
    )
    assert out.view["state"] == "in_dialogue"
    assert stored_summary(attempt_id) is None
    # Taken back, not turned down: no 不太對 is recorded.
    assert (
        current(attempt_id)["rejected_summary"] is None and current(attempt_id)["rejected_at"] == []
    )


def test_an_interrupted_reading_is_never_confirmed_even_by_the_models_yes(client, tutor):
    _, replies = tutor
    attempt_id, _, step = voice_to_confirming(client, tutor)
    again = answered(
        attempt_id, step, "對", replies, model=judged(), heard=step.say[:12], interrupted=True
    )
    assert again.view["state"] == "confirming" and again.say == step.say
    assert stored_summary(attempt_id) is None


def test_no_is_a_failed_confirmation_and_the_answer_is_the_next_message(client, tutor):
    calls, replies = tutor
    attempt_id, _, step = voice_to_confirming(client, tutor)
    replies.append(NOT_MET)
    out = answered(
        attempt_id, step, "不對，我是說後果不重要", replies, model=judged("disagree", "不對")
    )
    assert out.view["state"] == "in_dialogue"
    assert len(current(attempt_id)["rejected_at"]) == 1
    assert ("student", "不對，我是說後果不重要") in messages(attempt_id)
    assert "不對，我是說後果不重要" in calls[-1]["messages"][1]["content"]
    assert last_student_meta(attempt_id)["voice_confirmation"]["decision"] == "not_confirmed"


def test_a_correction_is_a_failed_confirmation_too(client, tutor):
    _, replies = tutor
    attempt_id, _, step = voice_to_confirming(client, tutor)
    replies.append(NOT_MET)
    text = "對，但我想補充，如果他是自願的就不一樣"
    out = answered(attempt_id, step, text, replies, model=judged("addition", "但我想補充"))
    assert out.view["state"] == "in_dialogue"
    assert len(current(attempt_id)["rejected_at"]) == 1


def test_judged_unclear_twice_is_a_failed_confirmation(client, tutor):
    _, replies = tutor
    attempt_id, _, step = voice_to_confirming(client, tutor)
    again = answered(attempt_id, step, "嗯……", replies, model=judged("unclear", ""))
    assert again.view["state"] == "confirming"
    assert again.say == vt.ASK_AGAIN["zh-Hant"]
    replies.append(NOT_MET)
    out = answered(attempt_id, again, "大概吧", replies, model=judged("unclear", ""), asks=1)
    assert out.view["state"] == "in_dialogue"
    assert stored_summary(attempt_id) is None
    assert len(current(attempt_id)["rejected_at"]) == 1


def test_a_yes_after_being_asked_again_confirms(client, tutor):
    _, replies = tutor
    attempt_id, _, step = voice_to_confirming(client, tutor)
    again = answered(attempt_id, step, "嗯", replies, model=judged("unclear", ""))
    out = answered(attempt_id, again, "對", replies, model=judged(), asks=1)
    assert out.view["state"] in ("reviewing", "awaiting_reflection_prompt")


def test_the_models_yes_is_overruled_when_the_student_said_no(client, tutor):
    _, replies = tutor
    attempt_id, _, step = voice_to_confirming(client, tutor)
    again = answered(attempt_id, step, "不對", replies, model=judged("agree", "不對"))
    assert again.say == vt.ASK_AGAIN["zh-Hant"]
    assert last_student_meta(attempt_id)["voice_confirmation"]["vetoed"] is True


def test_a_yes_must_quote_what_the_student_actually_said(client, tutor):
    _, replies = tutor
    attempt_id, _, step = voice_to_confirming(client, tutor)
    again = answered(attempt_id, step, "嗯哼", replies, model=judged("agree", "完全同意"))
    assert again.say == vt.ASK_AGAIN["zh-Hant"]
    assert stored_summary(attempt_id) is None


def test_words_that_are_not_this_summary_never_confirm(client, tutor):
    _, replies = tutor
    attempt_id, _, step = voice_to_confirming(client, tutor)
    stale = vt.VoiceStep(view=step.view, say="我整理一下：你的立場是要拉桿。這樣整理對嗎？")
    again = answered(attempt_id, stale, "對", replies, model=judged())
    assert again.view["state"] == "confirming" and again.say == step.say
    assert stored_summary(attempt_id) is None


def test_there_is_no_point_to_answer_outside_one(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(OPENING)
    said(attempt["id"], "不能主動害人")
    with storage.transaction() as db:
        assert vt.point_of(db, _account(db), attempt["id"], 1_000_000.0) is None


def test_a_summary_at_the_message_limit_is_acknowledged_as_the_card_does(
    client, tutor, monkeypatch
):
    from app.modules.solo_activity import attempt_machine as sm

    _, replies = tutor
    monkeypatch.setattr(sm, "MESSAGE_LIMIT", 2)
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(OPENING)
    said(attempt["id"], "不能主動害人")
    replies.append(NOT_MET)
    step = said(attempt["id"], "因為是我親手造成的")
    with storage.transaction() as db:
        point = vt.point_of(db, _account(db), attempt["id"], 1_000_000.0)
    assert point.capped and step.say == point.expected
    with storage.transaction() as db:
        out = vt.acknowledge(db, _account(db), attempt["id"], point, step.say, 1_000_000.0)
    view = out.view if out.follow is None else asyncio.run(service.finish_action(out.follow))
    assert view["state"] != "confirming"
    assert current(attempt["id"])["status"] == "capped"


# ---- the final summary by voice --------------------------------------------------------------


def to_final(client, tutor, final):
    """The only scenario confirmed by voice, no next scenario, and the final summary written."""
    from tests.solo_activity.test_solo_final_confirmation import NO_SCENARIO

    _, replies = tutor
    attempt_id, _, step = voice_to_confirming(client, tutor)
    replies.extend([judged(), NO_SCENARIO, final])
    with storage.transaction() as db:
        point = vt.point_of(db, _account(db), attempt_id, 1_000_000.0)
        prepared = vj.prepare(
            db,
            _account(db),
            attempt_id,
            summary=point.summary,
            heard=step.say,
            said="對",
            at=1_000_000.0,
        )
    judgment = asyncio.run(
        vj.judge(
            prepared,
            expected=point.expected,
            parts=point.parts,
            heard=step.say,
            interrupted=False,
            said="對",
            locale="zh-Hant",
        )
    )
    with storage.transaction() as db:
        out = vt.answer(
            db,
            _account(db),
            attempt_id,
            point=point,
            spoken=step.say,
            heard=step.say,
            said="對",
            judgment=judgment,
            asks=0,
            reads=0,
            at=1_000_000.0,
        )
    view = asyncio.run(service.finish_action(out.follow))
    assert view["state"] == "reflecting"
    with storage.transaction() as db:
        final_point = vt.point_of(db, _account(db), attempt_id, 1_000_000.0)
    return attempt_id, vt.VoiceStep(view=view, say=final_point.expected)


def test_the_final_summary_is_read_and_a_spoken_yes_completes_the_attempt(client, tutor):
    from tests.solo_activity.test_solo_final_confirmation import FINAL

    _, replies = tutor
    attempt_id, step = to_final(client, tutor, FINAL)
    assert FINAL["final_position"].rstrip("。") in step.say
    out = answered(attempt_id, step, "對", replies, model=judged())
    assert out.view["state"] == "completed"
    with storage.transaction() as db:
        assert db.get(SoloAttempt, attempt_id).final["status"] == "confirmed"


def test_a_spoken_no_to_the_final_summary_writes_it_again_with_the_students_words(client, tutor):
    from tests.solo_activity.test_solo_final_confirmation import FINAL, SECOND

    _, replies = tutor
    attempt_id, step = to_final(client, tutor, FINAL)
    replies.append(SECOND)
    out = answered(
        attempt_id, step, "不對，我其實有猶豫", replies, model=judged("disagree", "不對")
    )
    assert out.view["state"] == "reflecting"
    assert ("student", "不對，我其實有猶豫") in messages(attempt_id)
    meta = last_student_meta(attempt_id)
    assert meta["final_feedback"] is True and meta["voice_confirmation"]["point"] == "final"


# ---- #212: an ended activity takes nothing by voice either (review of #204, 11-24) ----------


def test_after_the_teacher_ends_the_activity_voice_neither_opens_nor_writes(
    client,
    tutor,
    voice_on,  # noqa: F811
):
    """After 立即結束 the student is at a summary to confirm: voice cannot join, and 再問一次
    (which writes without begin_action) is refused with nothing written."""
    _, replies = tutor
    s = setup(client)
    attempt_id = ok(start(client, s["activity_id"]))["id"]
    replies.append(OPENING)
    said(attempt_id, "不能主動害人")
    replies.append(MET)
    step = said(attempt_id, "因為是我親手造成的")
    assert step.view["state"] == "confirming"
    end_now(client, s)
    at = service.now() + 1
    with storage.transaction() as db:
        with pytest.raises(DomainError) as joined:
            vr.available(db, _account(db), attempt_id, at)
    assert joined.value.code == "ACTIVITY_ENDED"
    before = messages(attempt_id)
    with pytest.raises(DomainError) as asked:
        answered(attempt_id, step, "嗯……", replies, model=judged("unclear", ""), at=at)
    assert asked.value.code == "ACTIVITY_ENDED"
    assert messages(attempt_id) == before
