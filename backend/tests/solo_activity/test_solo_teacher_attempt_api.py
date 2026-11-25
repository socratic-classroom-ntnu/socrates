"""Item 9: the course owner reads one student's whole conversation in an activity, read only.

``GET /solo/activities/{activity_id}/students/{enrollment_id}/attempt``. The teacher's views are
their own classes: what is only the student's to act on (available actions, digests, the notice,
the principle hint, the turned-down summary) never reaches them, and a final summary the student
turned down twice stays hidden. Every refusal is the same 404 ACTIVITY_NOT_FOUND.
"""

import json
import time

from app.modules.course_management.repositories import Course, Enrollment
from app.modules.platform import storage
from app.modules.solo_activity import teacher_attempt
from tests.course_management.conftest import switch, user
from tests.course_management.test_courses_api import create_course
from tests.solo_activity.test_solo_attempts_api import (
    MET,
    NOT_MET,
    OPENING,
    SECOND,
    add_scenario,
    answer,
    confirm,
    do,
    join,
    ok,
    setup,
    start,
    to_confirming,
)
from tests.solo_activity.test_solo_final_confirmation import SECOND as REWRITTEN
from tests.solo_activity.test_solo_final_confirmation import settled, to_reflecting
from tests.solo_activity.test_solo_guests import enrollment_id, expire, join_as_guest, as_teacher

NOT_NOW = {"detail": "ACTIVITY_NOT_FOUND"}

# Only the student's to act on, or already inside ``student``: never in the teacher's view.
STUDENT_ONLY = {
    "available_actions",
    "summary_digest",
    "final_digest",
    "notice",
    "principle_hint",
    "rejected_summary",
    "display_name",
}


def read(client, s, eid=None, **params):
    eid = eid or enrollment_id(s["student"]["id"], s["course"]["id"])
    return client.get(
        f"/api/v2/solo/activities/{s['activity_id']}/students/{eid}/attempt", params=params
    )


def keys(value):
    if isinstance(value, dict):
        for key, inner in value.items():
            yield key
            yield from keys(inner)
    elif isinstance(value, list):
        for inner in value:
            yield from keys(inner)


def as_student(client, s):
    switch(client, s["student"])


def talk_to_confirming(client, s, replies):
    """The student has said two things and the tutor offers a summary; the teacher is logged in."""
    attempt = ok(start(client, s["activity_id"]))
    view = to_confirming(client, attempt["id"], replies)
    switch(client, s["teacher"])
    return attempt, view


# ---- who may read --------------------------------------------------------------------------


def test_the_owner_reads_the_whole_conversation(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    to_confirming(client, attempt["id"], replies)
    switch(client, s["teacher"])

    body = ok(read(client, s))
    assert set(body) == {"activity", "student", "attempt"}
    assert body["activity"] == {
        "id": s["activity_id"],
        "title": "電車難題",
        "course_id": s["course"]["id"],
        "course_name": s["course"]["name"],
        "status": "open",
    }
    assert body["student"]["display_name"] == "student同學"
    assert (body["student"]["kind"], body["student"]["guest_number"]) == ("registered", None)
    seen = body["attempt"]
    assert (seen["id"], seen["state"], seen["scenario_index"]) == (attempt["id"], "confirming", 0)
    messages = seen["messages"]
    assert [(m["role"], m["scenario_index"]) for m in messages] == [
        ("student", 0),
        ("tutor", 0),
        ("student", 0),
        ("tutor", 0),
    ]
    assert messages[0]["text"] == "不能主動害人"
    assert messages[2]["text"] == "因為是我親手造成的"
    assert all(m["created_at"] > 0 and m["id"] for m in messages)
    assert [m["move"] for m in messages] == [None, "probe", None, "probe"]


def test_every_refusal_is_the_same_404(client, tutor):
    s = setup(client)
    ok(start(client, s["activity_id"]))
    eid = enrollment_id(s["student"]["id"], s["course"]["id"])

    def refused(response):
        assert (response.status_code, response.json()) == (404, NOT_NOW)

    # The student themself, even though it is their own conversation.
    as_student(client, s)
    refused(read(client, s, eid))
    # A classmate.
    join(client, s["course"], "classmate")
    refused(read(client, s, eid))
    # Another teacher, and a stranger.
    user(client, "other", account_role="teacher")
    create_course(client)
    refused(read(client, s, eid))
    user(client, "outsider")
    refused(read(client, s, eid))

    switch(client, s["teacher"])
    assert read(client, s, eid).status_code == 200
    # Missing activity, and an enrollment that does not exist.
    refused(client.get(f"/api/v2/solo/activities/missing/students/{eid}/attempt"))
    refused(read(client, s, "missing"))


def test_an_enrollment_of_another_course_is_not_found(client, tutor):
    s = setup(client)
    user(client, "other", account_role="teacher")
    other_course = create_course(client)
    join(client, other_course, "stranger")
    foreign = enrollment_id(client.get("/api/v2/auth/me").json()["id"], other_course["id"])
    switch(client, s["teacher"])
    response = read(client, s, foreign)
    assert (response.status_code, response.json()) == (404, NOT_NOW)


def test_the_owners_own_enrollment_is_not_found(client, tutor):
    s = setup(client)
    with storage.transaction() as db:
        mine = Enrollment(
            course_id=s["course"]["id"], account_id=s["teacher"]["id"], display_name="老師"
        )
        db.add(mine)
        db.flush()
        mine_id = mine.id
    switch(client, s["teacher"])
    response = read(client, s, mine_id)
    assert (response.status_code, response.json()) == (404, NOT_NOW)


def test_a_private_practice_course_is_not_found_even_to_its_owner(client, tutor):
    s = setup(client)
    eid = enrollment_id(s["student"]["id"], s["course"]["id"])
    with storage.transaction() as db:
        course = db.get(Course, s["course"]["id"])
        course.practice_account_id = s["student"]["id"]
    switch(client, s["teacher"])
    response = read(client, s, eid)
    assert (response.status_code, response.json()) == (404, NOT_NOW)


# ---- not started ---------------------------------------------------------------------------


def test_a_student_who_has_not_started_has_no_attempt(client, tutor):
    s = setup(client)
    switch(client, s["teacher"])
    body = ok(read(client, s))
    assert body["attempt"] is None
    assert body["student"]["display_name"] == "student同學"
    assert body["student"]["last_activity_at"] is None


# ---- what is left out ----------------------------------------------------------------------


def test_nothing_that_is_only_the_students_reaches_the_teacher(client, tutor):
    _, replies = tutor
    s = setup(client)
    _, view = talk_to_confirming(client, s, replies)
    # The student's own view does carry these while confirming: they must be here, to be left out.
    assert view["summary_digest"] and view["principle_hint"] and view["available_actions"]

    seen = ok(read(client, s))["attempt"]
    assert not STUDENT_ONLY & set(seen)
    assert not STUDENT_ONLY & set(keys(seen["scenarios"]))
    assert not STUDENT_ONLY & set(keys(seen["messages"]))
    raw = json.dumps(seen, ensure_ascii=False)
    assert view["summary_digest"] not in raw
    # What the tutor observed about the student is not for the teacher either.
    assert "observations" not in raw and "has_reason" not in raw


def test_the_attempt_lists_its_fields_and_no_more(client, tutor):
    _, replies = tutor
    s = setup(client)
    talk_to_confirming(client, s, replies)
    seen = ok(read(client, s))["attempt"]
    assert set(seen) == {
        "id",
        "state",
        "scenario_index",
        "scenarios",
        "messages",
        "candidate_summary",
        "revising",
        "final_summary",
        "final_status",
        "final_revised",
        "review_status",
        "cells",
    }
    assert set(seen["scenarios"][0]) == {
        "index",
        "id",
        "text",
        "change",
        "answer",
        "status",
        "confirmed_summary",
        "rejected_at",
        "first_message_id",
    }
    assert set(seen["messages"][0]) == {
        "id",
        "scenario_index",
        "role",
        "text",
        "created_at",
        "move",
        "revise_hint",
        "final_feedback",
    }


def test_the_summary_waiting_for_the_student_is_shown(client, tutor):
    _, replies = tutor
    s = setup(client)
    _, view = talk_to_confirming(client, s, replies)
    seen = ok(read(client, s))["attempt"]
    assert seen["candidate_summary"] == view["candidate_summary"]
    assert seen["scenarios"][0]["confirmed_summary"] is None


def test_a_confirmed_summary_is_shown_under_its_scenario(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    add_scenario(attempt["id"], SECOND)
    confirm(client, attempt["id"], to_confirming(client, attempt["id"], replies))
    switch(client, s["teacher"])
    seen = ok(read(client, s))["attempt"]
    first = seen["scenarios"][0]
    assert first["status"] == "goal_met"
    assert first["confirmed_summary"]["current_position"] == MET["summary"]["current_position"]
    assert seen["candidate_summary"] is None


def test_only_the_scenarios_the_student_has_reached_come_back(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    add_scenario(attempt["id"], SECOND)
    switch(client, s["teacher"])
    seen = ok(read(client, s))["attempt"]
    assert [scenario["index"] for scenario in seen["scenarios"]] == [0]
    assert SECOND not in json.dumps(seen, ensure_ascii=False)


# ---- the final summary ---------------------------------------------------------------------


def test_a_final_summary_the_student_is_still_reading_is_shown(client, tutor):
    s, _, view = to_reflecting(client, tutor)
    switch(client, s["teacher"])
    seen = ok(read(client, s))["attempt"]
    assert (seen["state"], seen["review_status"]) == ("reflecting", "in_progress")
    assert seen["final_summary"]["final_position"] == view["final_summary"]["final_position"]
    assert "normalized_text" not in seen["final_summary"]
    assert "final_digest" not in seen


def test_a_confirmed_final_summary_is_shown(client, tutor):
    s, attempt_id, view = to_reflecting(client, tutor)
    ok(do(client, attempt_id, "submit_reflection", {"summary_digest": view["final_digest"]}))
    switch(client, s["teacher"])
    seen = ok(read(client, s))["attempt"]
    assert (seen["state"], seen["final_status"]) == ("completed", "confirmed")
    assert seen["final_summary"]["final_position"] == view["final_summary"]["final_position"]


def test_a_summary_turned_down_twice_is_not_given_to_the_teacher(client, tutor):
    _, replies = tutor
    s, attempt_id, _ = to_reflecting(client, tutor)
    replies.append(REWRITTEN)
    settled(
        client, attempt_id, ok(do(client, attempt_id, "continue_reflection", {"text": "我有猶豫"}))
    )
    ok(do(client, attempt_id, "continue_reflection", {"text": "還是不像我"}))
    switch(client, s["teacher"])
    seen = ok(read(client, s))["attempt"]
    assert (seen["state"], seen["final_status"]) == ("completed", "unconfirmed")
    assert seen["final_summary"] is None
    assert seen["final_revised"] is True
    # What the student wrote about it is still theirs to be read, as ordinary messages.
    feedback = [m["text"] for m in seen["messages"] if m["final_feedback"]]
    assert feedback == ["我有猶豫", "還是不像我"]
    assert REWRITTEN["final_position"] not in json.dumps(seen, ensure_ascii=False)


# ---- 不太對 and where each scenario starts -------------------------------------------------


def press_again(client, s, attempt_id, replies, text):
    ok(do(client, attempt_id, "revise_viewpoint"))
    replies.append(NOT_MET)
    ok(do(client, attempt_id, "send_message", {"text": text, "revise_hint": "reason"}))
    replies.append(MET)
    view = ok(do(client, attempt_id, "send_message", {"text": text + "，再說清楚"}))
    assert view["state"] == "confirming"


def test_each_press_of_不太對_comes_back_with_its_time(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    to_confirming(client, attempt["id"], replies)
    press_again(client, s, attempt["id"], replies, "理由不對")
    press_again(client, s, attempt["id"], replies, "還是不對")
    switch(client, s["teacher"])
    seen = ok(read(client, s))["attempt"]
    (first,) = seen["scenarios"]
    assert len(first["rejected_at"]) == 2
    assert first["rejected_at"] == sorted(first["rejected_at"])
    # The hint comes with the sentence sent after the press, not with the press.
    hints = [m["revise_hint"] for m in seen["messages"] if m["role"] == "student"]
    assert hints == [None, None, "reason", None, "reason", None]


def test_a_scenario_never_pressed_has_no_times(client, tutor):
    _, replies = tutor
    s = setup(client)
    talk_to_confirming(client, s, replies)
    assert ok(read(client, s))["attempt"]["scenarios"][0]["rejected_at"] == []


def test_each_scenario_says_which_message_starts_it(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    add_scenario(attempt["id"], SECOND)
    confirm(client, attempt["id"], to_confirming(client, attempt["id"], replies))
    ok(do(client, attempt["id"], "next_scenario"))
    replies.append(OPENING)
    answer(client, attempt["id"], "五個人比一個人多")
    switch(client, s["teacher"])
    seen = ok(read(client, s))["attempt"]
    first, second = seen["scenarios"]
    by_id = {m["id"]: m for m in seen["messages"]}
    assert by_id[first["first_message_id"]]["text"] == "不能主動害人"
    assert by_id[second["first_message_id"]]["text"] == "五個人比一個人多"
    assert by_id[second["first_message_id"]]["scenario_index"] == 1


def test_a_scenario_without_messages_yet_has_no_first_message(client, tutor):
    s = setup(client)
    ok(start(client, s["activity_id"]))
    switch(client, s["teacher"])
    (scenario,) = ok(read(client, s))["attempt"]["scenarios"]
    assert scenario["first_message_id"] is None


def test_the_sentence_on_a_final_summary_does_not_start_a_scenario(client, tutor):
    _, replies = tutor
    s, attempt_id, _ = to_reflecting(client, tutor)
    replies.append(REWRITTEN)
    settled(
        client, attempt_id, ok(do(client, attempt_id, "continue_reflection", {"text": "我有猶豫"}))
    )
    switch(client, s["teacher"])
    seen = ok(read(client, s))["attempt"]
    starts = {scenario["first_message_id"] for scenario in seen["scenarios"]}
    feedback = {m["id"] for m in seen["messages"] if m["final_feedback"]}
    assert starts and not starts & feedback


# ---- only what is new ----------------------------------------------------------------------


def test_after_a_message_only_the_newer_ones_come_back(client, tutor):
    _, replies = tutor
    s = setup(client)
    talk_to_confirming(client, s, replies)
    every = ok(read(client, s))["attempt"]["messages"]
    newer = ok(read(client, s, after=every[1]["id"]))["attempt"]["messages"]
    assert [m["id"] for m in newer] == [m["id"] for m in every[2:]]
    assert ok(read(client, s, after=every[-1]["id"]))["attempt"]["messages"] == []


def test_after_a_message_the_rest_still_comes_whole(client, tutor):
    _, replies = tutor
    s = setup(client)
    talk_to_confirming(client, s, replies)
    full = ok(read(client, s))["attempt"]
    last = full["messages"][-1]["id"]
    cut = ok(read(client, s, after=last))["attempt"]
    # Scenarios, the summary and the state are the page's to redraw every time.
    assert {k: v for k, v in cut.items() if k != "messages"} == {
        k: v for k, v in full.items() if k != "messages"
    }


def test_an_unknown_message_gives_everything_again(client, tutor):
    _, replies = tutor
    s = setup(client)
    talk_to_confirming(client, s, replies)
    full = ok(read(client, s))["attempt"]["messages"]
    assert ok(read(client, s, after="missing"))["attempt"]["messages"] == full


def test_after_works_for_a_student_who_has_not_started(client, tutor):
    s = setup(client)
    switch(client, s["teacher"])
    assert ok(read(client, s, after="whatever"))["attempt"] is None


# ---- who the student is, and the live page's words -----------------------------------------


def test_the_students_last_action_is_worked_out_as_on_the_live_page(client, tutor):
    _, replies = tutor
    s = setup(client)
    talk_to_confirming(client, s, replies)
    body = ok(read(client, s))
    live = ok(client.get(f"/api/v2/solo/activities/{s['activity_id']}/progress"))["students"][0]
    assert body["student"]["last_activity_at"] == live["last_activity_at"]
    assert body["attempt"]["cells"] == live["cells"]
    assert body["attempt"]["review_status"] == live["review_status"]


def test_the_live_pages_words_for_a_finished_attempt(client, tutor):
    s, attempt_id, view = to_reflecting(client, tutor)
    ok(do(client, attempt_id, "submit_reflection", {"summary_digest": view["final_digest"]}))
    switch(client, s["teacher"])
    body = ok(read(client, s))
    live = ok(client.get(f"/api/v2/solo/activities/{s['activity_id']}/progress"))["students"][0]
    assert body["attempt"]["review_status"] == live["review_status"] == "completed"
    assert body["attempt"]["final_status"] == live["final_status"] == "confirmed"


def test_expired_guests_are_numbered_among_the_courses_expired_guests(client, tutor):
    s = setup(client)
    first = join_as_guest(client, s, "一號")
    ok(start(client, s["activity_id"]))
    second = join_as_guest(client, s, "二號")
    for guest in (first, second):
        expire(guest["id"])
    as_teacher(client, s)
    course_id = s["course"]["id"]
    one = ok(read(client, s, enrollment_id(first["id"], course_id)))
    two = ok(read(client, s, enrollment_id(second["id"], course_id)))
    assert (one["student"]["kind"], one["student"]["guest_number"]) == ("expired_guest", 1)
    assert (two["student"]["kind"], two["student"]["guest_number"]) == ("expired_guest", 2)
    # The first one answered; the second never started.
    assert one["attempt"] is not None and two["attempt"] is None


def test_a_guest_who_has_not_expired_is_a_guest_without_a_number(client, tutor):
    s = setup(client)
    guest = join_as_guest(client, s)
    as_teacher(client, s)
    body = ok(read(client, s, enrollment_id(guest["id"], s["course"]["id"])))
    assert (body["student"]["kind"], body["student"]["guest_number"]) == ("guest", None)


# ---- the activity --------------------------------------------------------------------------


def test_the_activity_status_comes_with_it(client, tutor, monkeypatch):
    s = setup(client)
    switch(client, s["teacher"])
    later = time.time() + 10 * 365 * 24 * 3600
    monkeypatch.setattr(teacher_attempt, "now", lambda: later)
    assert ok(read(client, s))["activity"]["status"] == "ended"
