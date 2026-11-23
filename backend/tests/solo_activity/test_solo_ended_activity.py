"""C7: once an activity ends (time up, or the teacher's 立即結束) no student may answer any more.

Attempts already begun stop where they are: the student reads what they wrote, nothing is
offered, every action is refused with ACTIVITY_ENDED, and no completion is made up for them.
"""

import asyncio
import time

from app.modules.identity_access.repositories import Account
from app.modules.platform import storage as storage
from app.modules.solo_activity import service as service
from app.modules.solo_activity.contracts import SendMessageBody
from tests.course_management.conftest import switch
from tests.course_management.test_activities_api import act
from tests.solo_activity.test_solo_attempts_api import (
    MET,
    OPENING,
    answer,
    confirm,
    do,
    ok,
    setup,
    start,
    to_confirming,
)

ENDED = {"detail": "ACTIVITY_ENDED"}


def end_now(client, s):
    switch(client, s["teacher"])
    assert act(client, s["activity_id"], "end_now").status_code == 200
    switch(client, s["student"])


def read(client, attempt_id):
    return ok(client.get(f"/api/v2/solo/attempts/{attempt_id}"))


def teacher_progress(client, s):
    switch(client, s["teacher"])
    view = ok(client.get(f"/api/v2/solo/activities/{s['activity_id']}/progress"))
    switch(client, s["student"])
    return view


def test_answering_works_until_the_end_time_then_stops(client, tutor, monkeypatch):
    calls, replies = tutor
    ends_at = time.time() + 600
    s = setup(client, ends_at=ends_at)
    attempt = ok(start(client, s["activity_id"]))

    replies.append(OPENING)
    view = answer(client, attempt["id"])
    assert view["state"] == "in_dialogue"
    assert view["available_actions"] == ["send_message"]

    monkeypatch.setattr(service, "now", lambda: ends_at + 1)
    view = read(client, attempt["id"])
    assert view["available_actions"] == []
    assert [m["role"] for m in view["messages"]] == ["student", "tutor"]

    response = do(client, attempt["id"], "send_message", {"text": "可是我還想說"})
    assert (response.status_code, response.json()) == (409, ENDED)
    assert len(calls) == 1
    after = read(client, attempt["id"])
    # Nothing was saved and the attempt stays where it stopped.
    assert after["state"] == "in_dialogue"
    assert [m["text"] for m in after["messages"]] == [m["text"] for m in view["messages"]]


def test_every_action_is_refused_mid_confirmation(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    view = to_confirming(client, attempt["id"], replies)
    digest = view["summary_digest"]

    end_now(client, s)
    view = read(client, attempt["id"])
    assert view["state"] == "confirming"
    assert view["available_actions"] == []
    for action, body in (
        ("confirm_viewpoint", {"summary_digest": digest}),
        ("revise_viewpoint", None),
        # Without its body too: the end is the reason, not the missing body.
        ("confirm_viewpoint", None),
    ):
        response = do(client, attempt["id"], action, body)
        assert (response.status_code, response.json()) == (409, ENDED), action
    assert read(client, attempt["id"])["scenarios"][0]["status"] == "in_progress"


def test_a_tutor_reply_already_on_its_way_still_lands(client, tutor):
    """The student's message was accepted while the activity was open; its reply is kept."""
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    with storage.transaction() as db:
        account = db.get(Account, s["student"]["id"])
        body = SendMessageBody(text="不能主動害人")
        prepared = service.begin_action(
            db, account, attempt["id"], "send_message", body, service.now()
        )
    end_now(client, s)
    replies.append(OPENING)
    view = asyncio.run(service.finish_action(prepared))
    assert view["state"] == "in_dialogue"
    assert [m["role"] for m in view["messages"]] == ["student", "tutor"]
    assert view["available_actions"] == []


def test_ended_attempts_stay_readable_and_teacher_counts_are_unchanged(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    view = confirm(client, attempt["id"], to_confirming(client, attempt["id"], replies))
    assert view["state"] == "reviewing"
    done = ok(do(client, attempt["id"], "submit_review"))
    assert done["state"] == "completed"

    end_now(client, s)
    assert read(client, attempt["id"]) == done
    progress = teacher_progress(client, s)
    assert progress["status"] == "ended"
    assert progress["summary"]["done"] == 1
    assert [row["overall"] for row in progress["students"]] == ["done"]


def test_an_unfinished_attempt_is_not_marked_done(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(OPENING)
    answer(client, attempt["id"])
    replies.append(MET)
    end_now(client, s)

    progress = teacher_progress(client, s)
    assert progress["summary"]["done"] == 0
    assert [row["overall"] for row in progress["students"]] == ["in_progress"]
    assert read(client, attempt["id"])["state"] == "in_dialogue"
