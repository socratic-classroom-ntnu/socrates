"""Logging in on a guest's device, through the real course and solo-activity hooks.

test_guest_merge covers the merge with stand-in hooks; this file checks that what a guest does in a
course arrives under the account that logs in, as the frontend's G25 notice claims.
"""

from tests.course_management.conftest import switch, user
from tests.solo_activity.test_solo_attempts_api import OPENING, answer, ok, setup, start
from tests.solo_activity.test_solo_guests import (
    attempts_of,
    enrollment_id,
    join_as_guest,
    messages_of,
)


def test_a_guests_course_and_answers_move_to_the_account_that_logs_in(client, tutor):
    _, replies = tutor
    s = setup(client)
    ming = user(client, "ming")
    guest = join_as_guest(client, s)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(OPENING)
    answer(client, attempt["id"], "我是訪客時說的")
    assert switch(client, ming)["guest_merge"] == "MERGED"
    course_id = s["course"]["id"]
    assert enrollment_id(guest["id"], course_id) is None
    assert enrollment_id(ming["id"], course_id) is not None
    assert attempts_of(guest["id"]) == []
    assert attempts_of(ming["id"]) == [(attempt["id"], s["activity_id"])]
    assert "我是訪客時說的" in messages_of(attempt["id"])
    assert ok(client.get(f"/api/v2/solo/attempts/{attempt['id']}"))["id"] == attempt["id"]


def test_when_both_answered_the_account_keeps_its_own(client, tutor):
    _, replies = tutor
    s = setup(client)
    kept = ok(start(client, s["activity_id"]))
    guest = join_as_guest(client, s)
    dropped = ok(start(client, s["activity_id"]))
    replies.append(OPENING)
    answer(client, dropped["id"], "訪客的那份")
    assert switch(client, s["student"])["guest_merge"] == "MERGED"
    assert attempts_of(s["student"]["id"]) == [(kept["id"], s["activity_id"])]
    assert attempts_of(guest["id"]) == []
    assert messages_of(dropped["id"]) == []
    assert enrollment_id(guest["id"], s["course"]["id"]) is None
