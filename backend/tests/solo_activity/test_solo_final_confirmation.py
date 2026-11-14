"""O6: after the last scenario the student confirms a final summary of their whole line of thought.

The summary is written by ``final_summary`` from the confirmed stages and the student's own words.
The student says 對 (``submit_reflection``) or 不太對 (``continue_reflection``, with one sentence on
what is off); after the first 不太對 the summary is written again with that sentence, and a second
不太對 ends the attempt marked 未確認. Either way the last summary is kept for the radar.
When no summary can be written the student is never stuck: they may try again or finish without it.
"""

import json

import pytest
from sqlalchemy import select

from app.modules.platform import storage as storage
from app.modules.platform.errors import DomainError
from app.modules.solo_activity import attempt_machine as sm
from app.modules.solo_activity import service as service
from app.modules.solo_activity.repositories import SoloAttempt, SoloMessage
from tests.solo_activity.test_solo_attempts_api import do, ok, settled
from tests.solo_activity.test_solo_conclude import confirm_current
from tests.solo_activity.test_solo_extension import to_confirmed_view
from tests.solo_activity.test_solo_state_table import fresh

T0 = 1_000.0
NO_SCENARIO = RuntimeError("no scenario written")

FINAL = {
    "points": [
        {
            "text": "你認為主動害人和任其發生不一樣。",
            "sources": [{"message_ref": "m1", "quote": "不能主動害人"}],
        }
    ],
    "trajectory": [
        {
            "stance_id": None,
            "position": "不拉桿",
            "shift_reason": "",
            "sources": [{"message_ref": "m2", "quote": "親手造成"}],
        }
    ],
    "final_position": "你最後選擇不拉桿。",
    "reasoning_style": "你常從傷害是誰造成的來判斷。",
    "open_question": "什麼都不做，算不算也是一種選擇？",
    "normalized_text": "學生認為主動造成傷害與任其發生不同，所以不拉桿。",
}
SECOND = {**FINAL, "final_position": "你最後選擇不拉桿，但承認這很難受。"}
SUMMARY = {"points": [{"text": "整理", "sources": []}], "final_position": "不拉"}


def reviewing() -> sm.AttemptState:
    a = confirm_current(fresh(1))
    assert a.state == "reviewing"
    return a


def waiting() -> tuple[sm.AttemptState, sm.PendingTurn]:
    return sm.start_final(reviewing(), T0)


def reflecting(summary=SUMMARY) -> sm.AttemptState:
    a, pending = waiting()
    shown = sm.apply_final_summary(a, pending.key, summary)
    assert shown is not None
    return shown


def final_contexts(calls):
    """The provider calls that wrote a final summary: they alone carry scenarios."""
    contexts = (json.loads(call["messages"][1]["content"]) for call in calls)
    return [context for context in contexts if "scenarios" in context]


def to_reflecting(client, tutor, final=FINAL):
    """The only scenario confirmed, no next scenario written, and the final summary shown."""
    _, replies = tutor
    s, attempt_id, view = to_confirmed_view(client, replies, [NO_SCENARIO, final])
    return s, attempt_id, view


def stored(attempt_id: str) -> SoloAttempt:
    with storage.transaction() as db:
        row = db.get(SoloAttempt, attempt_id)
        db.expunge(row)
        return row


# ---- the machine ---------------------------------------------------------------------------


def test_the_review_offers_writing_the_summary_or_finishing_without_it():
    assert sm.actions_for(reviewing(), T0) == ["retry_reflection_prompt", "submit_review"]


def test_starting_the_final_summary_waits_and_offers_retry_only_when_stale():
    a, pending = waiting()
    assert a.state == "awaiting_reflection_prompt"
    assert a.pending_key == pending.key
    assert sm.actions_for(a, T0 + sm.STALE_SECONDS - 1) == []
    assert sm.actions_for(a, T0 + sm.STALE_SECONDS + 1) == ["retry_reflection_prompt"]


def test_the_summary_is_shown_for_confirmation():
    a = reflecting()
    assert a.state == "reflecting"
    assert a.final.summary == SUMMARY
    assert a.final.digest
    assert sm.actions_for(a, T0) == ["submit_reflection", "continue_reflection"]


def test_a_reply_for_another_key_changes_nothing():
    a, _ = waiting()
    assert sm.apply_final_summary(a, "someone-else", SUMMARY) is None
    assert sm.final_failed(a, "someone-else", "tutor_unavailable") is None


def test_confirming_the_shown_summary_completes_it_as_confirmed():
    a = reflecting()
    done = sm.submit_reflection(a, a.final.digest or "")
    assert done.state == "completed"
    assert (done.final.status, done.final.summary) == ("confirmed", SUMMARY)
    assert sm.actions_for(done, T0) == []


def test_only_the_summary_currently_shown_can_be_confirmed():
    with pytest.raises(DomainError) as error:
        sm.submit_reflection(reflecting(), "an-older-digest")
    assert error.value.code == "SOLO_SUMMARY_STALE"


def test_the_first_不太對_writes_the_summary_again():
    a = reflecting()
    again, pending = sm.continue_reflection(a, T0)
    assert pending is not None
    assert again.state == "awaiting_reflection_prompt"
    assert again.final.rejections == 1
    # The result of the first call can no longer land.
    assert pending.key != a.pending_key
    shown = sm.apply_final_summary(again, pending.key, SECOND)
    assert shown is not None and shown.state == "reflecting"
    assert shown.final.summary == SECOND


def test_a_second_不太對_ends_the_attempt_unconfirmed_and_keeps_the_last_summary():
    first, pending = sm.continue_reflection(reflecting(), T0)
    shown = sm.apply_final_summary(first, pending.key, SECOND)
    assert shown is not None
    done, none = sm.continue_reflection(shown, T0)
    assert none is None
    assert done.state == "completed"
    assert (done.final.status, done.final.summary) == ("unconfirmed", SECOND)


def test_a_confirmation_after_one_不太對_is_confirmed():
    first, pending = sm.continue_reflection(reflecting(), T0)
    shown = sm.apply_final_summary(first, pending.key, SECOND)
    assert shown is not None
    done = sm.submit_reflection(shown, shown.final.digest or "")
    assert (done.final.status, done.final.summary) == ("confirmed", SECOND)


def test_a_failed_call_goes_back_to_the_review_with_a_notice_and_can_be_tried_again():
    a, pending = waiting()
    failed = sm.final_failed(a, pending.key, "tutor_unavailable")
    assert failed is not None
    assert (failed.state, failed.notice) == ("reviewing", "tutor_unavailable")
    again, retried = sm.retry_reflection_prompt(failed, T0)
    assert again.state == "awaiting_reflection_prompt"
    assert retried.key != pending.key


@pytest.mark.parametrize(
    "build", [lambda: confirm_current(fresh(2)), lambda: fresh(1), lambda: reflecting()]
)
def test_the_summary_is_only_started_from_the_review(build):
    with pytest.raises(DomainError) as error:
        sm.start_final(build(), T0)
    assert error.value.code == "SOLO_ACTION_UNAVAILABLE"


def test_finishing_without_a_summary_still_completes():
    done = sm.submit_review(reviewing())
    assert done.state == "completed"
    assert done.final.status is None


# ---- the API -------------------------------------------------------------------------------


def test_the_last_confirmation_leads_straight_to_the_final_summary(client, tutor):
    calls, _ = tutor
    _, _, view = to_reflecting(client, tutor)
    assert view["state"] == "reflecting"
    assert view["available_actions"] == ["submit_reflection", "continue_reflection"]
    assert view["final_digest"]
    shown = view["final_summary"]
    assert shown["final_position"] == FINAL["final_position"]
    # Only for the system's comparisons: never shown to the student.
    assert "normalized_text" not in shown
    student = {m["text"]: m["id"] for m in view["messages"] if m["role"] == "student"}
    assert shown["points"][0]["sources"] == [
        {"message_id": student["不能主動害人"], "quote": "不能主動害人", "start": 0, "end": 6}
    ]
    assert shown["trajectory"][0]["sources"][0]["quote"] == "親手造成"
    (context,) = final_contexts(calls)
    (scenario,) = context["scenarios"]
    assert scenario["scenario"] == view["scenarios"][0]["text"]
    assert scenario["confirmed"]["current_position"] == "不拉桿"
    assert context["student_messages"] == [
        {"ref": "m1", "text": "不能主動害人"},
        {"ref": "m2", "text": "因為是我親手造成的"},
    ]
    assert context["output_locale"] == service.DEFAULT_LOCALE


def test_confirming_the_final_summary_completes_the_attempt(client, tutor):
    _, attempt_id, view = to_reflecting(client, tutor)
    done = ok(do(client, attempt_id, "submit_reflection", {"summary_digest": view["final_digest"]}))
    assert (done["state"], done["final_status"], done["available_actions"]) == (
        "completed",
        "confirmed",
        [],
    )
    assert done["final_summary"]["final_position"] == FINAL["final_position"]


def test_不太對_takes_one_sentence_and_the_summary_is_written_again_with_it(client, tutor):
    calls, replies = tutor
    _, attempt_id, view = to_reflecting(client, tutor)
    replies.append(SECOND)
    again = settled(
        client,
        attempt_id,
        ok(do(client, attempt_id, "continue_reflection", {"text": "我其實有猶豫"})),
    )
    assert again["state"] == "reflecting"
    assert again["final_revised"] is True
    assert again["final_summary"]["final_position"] == SECOND["final_position"]
    assert again["final_digest"] != view["final_digest"]
    first, second = final_contexts(calls)
    assert "revision" not in first
    assert second["revision"]["student_says"] == "我其實有猶豫"
    assert second["revision"]["rejected"]["final_position"] == FINAL["final_position"]
    assert {"ref": "m3", "text": "我其實有猶豫"} in second["student_messages"]
    # The sentence is the student's words, kept like any other message.
    assert again["messages"][-1]["text"] == "我其實有猶豫"


def test_不太對_needs_the_sentence(client, tutor):
    _, attempt_id, _ = to_reflecting(client, tutor)
    assert do(client, attempt_id, "continue_reflection").status_code == 422


def test_a_second_不太對_ends_unconfirmed_without_another_call(client, tutor):
    calls, replies = tutor
    _, attempt_id, _ = to_reflecting(client, tutor)
    replies.append(SECOND)
    settled(
        client,
        attempt_id,
        ok(do(client, attempt_id, "continue_reflection", {"text": "我其實有猶豫"})),
    )
    done = ok(do(client, attempt_id, "continue_reflection", {"text": "還是不像我"}))
    assert (done["state"], done["final_status"]) == ("completed", "unconfirmed")
    assert done["final_summary"]["final_position"] == SECOND["final_position"]
    assert len(final_contexts(calls)) == 2


def test_a_failed_call_leaves_the_review_with_retry_and_finish(client, tutor):
    _, replies = tutor
    _, attempt_id, view = to_confirmed_view(client, replies, [NO_SCENARIO, RuntimeError("down")])
    assert (view["state"], view["notice"]) == ("reviewing", "tutor_unavailable")
    assert view["available_actions"] == ["retry_reflection_prompt", "submit_review"]
    replies.append(FINAL)
    again = settled(client, attempt_id, ok(do(client, attempt_id, "retry_reflection_prompt")))
    assert (again["state"], again["notice"]) == ("reflecting", None)


def test_without_a_provider_the_student_can_still_finish(client, tutor, monkeypatch):
    _, replies = tutor
    _, attempt_id, _ = to_confirmed_view(client, replies, [NO_SCENARIO, RuntimeError("down")])
    # The teacher's provider disappears before the student tries again.
    monkeypatch.setattr(service, "resolve_owner_chain", lambda *args, **kwargs: ([], None))
    view = ok(do(client, attempt_id, "retry_reflection_prompt"))
    assert (view["state"], view["notice"]) == ("reviewing", "owner_provider_missing")
    done = ok(do(client, attempt_id, "submit_review"))
    assert (done["state"], done["final_status"], done["final_summary"]) == (
        "completed",
        None,
        None,
    )


def test_the_radar_reads_every_students_final_summary(client, tutor):
    s, attempt_id, view = to_reflecting(client, tutor)
    ok(do(client, attempt_id, "submit_reflection", {"summary_digest": view["final_digest"]}))
    with storage.transaction() as db:
        (entry,) = service.final_summaries(db, s["activity_id"])
        message_ids = set(
            db.scalars(select(SoloMessage.id).where(SoloMessage.attempt_id == attempt_id))
        )
    assert entry["attempt_id"] == attempt_id
    assert entry["status"] == "confirmed"
    assert entry["summary"]["normalized_text"] == FINAL["normalized_text"]
    assert entry["summary"]["points"][0]["sources"][0]["message_id"] in message_ids


def test_an_unfinished_attempt_gives_the_radar_nothing(client, tutor):
    s, _, _ = to_reflecting(client, tutor)
    with storage.transaction() as db:
        assert service.final_summaries(db, s["activity_id"]) == []


def test_the_final_summary_survives_a_refresh(client, tutor):
    _, attempt_id, view = to_reflecting(client, tutor)
    again = ok(client.get(f"/api/v2/solo/attempts/{attempt_id}"))
    assert again["final_summary"] == view["final_summary"]
    assert again["final_digest"] == view["final_digest"]
    assert stored(attempt_id).final["summary"]["normalized_text"] == FINAL["normalized_text"]


# ---- Fizzy's review on #150 ----------------------------------------------------------------


def test_the_confirmation_does_not_wait_for_the_summary(client, tutor):
    """The summary is written after the response; the page keeps re-reading meanwhile."""
    _, replies = tutor
    from tests.solo_activity.test_solo_attempts_api import MET, NOT_MET, answer, setup, start

    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(NOT_MET)
    answer(client, attempt["id"])
    replies.append(MET)
    view = ok(do(client, attempt["id"], "send_message", {"text": "因為是我親手造成的"}))
    replies.extend([NO_SCENARIO, FINAL])
    answered = ok(
        do(client, attempt["id"], "confirm_viewpoint", {"summary_digest": view["summary_digest"]})
    )
    assert answered["state"] == "awaiting_reflection_prompt"
    assert answered["available_actions"] == []
    assert settled(client, attempt["id"], answered)["state"] == "reflecting"


def test_a_completed_review_says_completed_to_the_student_and_the_teacher(client, tutor):
    from tests.course_management.conftest import switch

    s, attempt_id, view = to_reflecting(client, tutor)
    brief = ok(client.get(f"/api/v2/solo/activities/{s['activity_id']}"))["attempt"]
    assert brief["review_status"] == "in_progress"
    switch(client, s["teacher"])
    reading = ok(client.get(f"/api/v2/solo/activities/{s['activity_id']}/progress"))
    assert (reading["students"][0]["overall"], reading["summary"]["done"]) == ("in_progress", 0)
    assert reading["students"][0]["final_status"] is None
    switch(client, s["student"])
    ok(do(client, attempt_id, "submit_reflection", {"summary_digest": view["final_digest"]}))
    brief = ok(client.get(f"/api/v2/solo/activities/{s['activity_id']}"))["attempt"]
    assert brief["review_status"] == "completed"
    switch(client, s["teacher"])
    done = ok(client.get(f"/api/v2/solo/activities/{s['activity_id']}/progress"))
    row = done["students"][0]
    assert (row["overall"], row["review_status"], row["final_status"]) == (
        "done",
        "completed",
        "confirmed",
    )
    assert done["summary"]["done"] == 1
    stats = ok(client.get(f"/api/v2/solo/activities/{s['activity_id']}/analysis"))
    assert (stats["summary"]["done"], stats["students"][0]["final_status"]) == (1, "confirmed")


def test_a_summary_turned_down_twice_is_unconfirmed_for_the_teacher(client, tutor):
    from tests.course_management.conftest import switch

    _, replies = tutor
    s, attempt_id, _ = to_reflecting(client, tutor)
    replies.append(SECOND)
    settled(
        client, attempt_id, ok(do(client, attempt_id, "continue_reflection", {"text": "不太像"}))
    )
    ok(do(client, attempt_id, "continue_reflection", {"text": "還是不像"}))
    switch(client, s["teacher"])
    row = ok(client.get(f"/api/v2/solo/activities/{s['activity_id']}/progress"))["students"][0]
    assert (row["overall"], row["final_status"]) == ("done", "unconfirmed")


def test_the_sentence_on_the_final_summary_is_marked_as_review_feedback(client, tutor):
    _, replies = tutor
    _, attempt_id, _ = to_reflecting(client, tutor)
    replies.append(SECOND)
    view = settled(
        client,
        attempt_id,
        ok(do(client, attempt_id, "continue_reflection", {"text": "我其實有猶豫"})),
    )
    marked = [(m["text"], m["final_feedback"]) for m in view["messages"] if m["role"] == "student"]
    assert marked == [
        ("不能主動害人", False),
        ("因為是我親手造成的", False),
        ("我其實有猶豫", True),
    ]
