"""Guests in solo activities: they answer like students, the teacher sees who is a guest, and
their attempts move to the account they log in as.

An expired guest is shown as 匿名訪客 N: numbered only among the expired guests of the course,
in the order they joined it (ties by enrollment id), worked out when asked and never stored.
Expiry is read from guest_expires_at, so a guest past it counts as expired before the daily job.
"""

import time

from sqlalchemy import select

from app.modules.course_management.repositories import Enrollment
from app.modules.identity_access.repositories import Account
from app.modules.platform import storage as storage
from app.modules.solo_activity import guest_records
from app.modules.solo_activity.repositories import SoloAttempt, SoloMessage
from tests.course_management.conftest import switch
from tests.course_management.test_guest_join import as_guest, guest_join, leave
from tests.solo_activity.test_solo_attempts_api import OPENING, answer, ok, setup, start


def course_code(s) -> str:
    return s["course"]["code"]


def join_as_guest(client, s, nickname="安靜的貓頭鷹"):
    leave(client)
    return as_guest(guest_join(client, course_code(s), nickname=nickname))["account"]


def expire(account_id, at=None):
    with storage.transaction() as db:
        db.get(Account, account_id).guest_expires_at = (time.time() - 1) if at is None else at


def as_teacher(client, s):
    leave(client)
    switch(client, s["teacher"])


def students(client, s, view):
    response = client.get(f"/api/v2/solo/activities/{s['activity_id']}/{view}")
    assert response.status_code == 200, response.text
    return {item["enrollment_id"]: item for item in response.json()["students"]}


def enrollment_id(account_id, course_id):
    with storage.transaction() as db:
        return db.scalar(
            select(Enrollment.id).where(
                Enrollment.account_id == account_id, Enrollment.course_id == course_id
            )
        )


def test_a_guest_answers_a_solo_activity(client, tutor):
    _, replies = tutor
    s = setup(client)
    join_as_guest(client, s)
    view = client.get(f"/api/v2/solo/activities/{s['activity_id']}")
    assert view.status_code == 200, view.text
    attempt = ok(start(client, s["activity_id"]))
    replies.append(OPENING)
    answered = answer(client, attempt["id"])
    assert answered["state"] == "in_dialogue"
    again = client.get(f"/api/v2/solo/attempts/{attempt['id']}")
    assert again.status_code == 200, again.text


def test_a_guest_cannot_open_the_teachers_views(client, tutor):
    s = setup(client)
    join_as_guest(client, s)
    for view in ("progress", "analysis"):
        response = client.get(f"/api/v2/solo/activities/{s['activity_id']}/{view}")
        assert (response.status_code, response.json()) == (403, {"detail": "GUEST_NOT_ALLOWED"})


def test_a_guest_already_in_keeps_answering_after_guests_are_turned_off(client, tutor):
    _, replies = tutor
    s = setup(client)
    guest = join_as_guest(client, s)
    cookies, csrf = dict(client.cookies), guest["csrf_token"]
    attempt = ok(start(client, s["activity_id"]))
    as_teacher(client, s)
    off = client.patch(f"/api/v2/courses/{s['course']['id']}", json={"allow_guest": False})
    assert off.status_code == 200
    leave(client)
    for name, value in cookies.items():
        client.cookies.set(name, value)
    client.headers["X-CSRF-Token"] = csrf
    replies.append(OPENING)
    assert answer(client, attempt["id"])["state"] == "in_dialogue"


def test_the_teacher_sees_who_is_a_guest(client, tutor):
    s = setup(client)
    guest = join_as_guest(client, s)
    ok(start(client, s["activity_id"]))
    as_teacher(client, s)
    course_id = s["course"]["id"]
    for view in ("progress", "analysis"):
        found = students(client, s, view)
        mine = found[enrollment_id(guest["id"], course_id)]
        assert (mine["kind"], mine["guest_number"], mine["display_name"]) == (
            "guest",
            None,
            "安靜的貓頭鷹",
        )
    registered = students(client, s, "progress")[enrollment_id(s["student"]["id"], course_id)]
    assert (registered["kind"], registered["guest_number"]) == ("registered", None)


def test_expired_guests_are_numbered_by_when_they_joined_and_only_among_themselves(client, tutor):
    s = setup(client)
    course_id = s["course"]["id"]
    first = join_as_guest(client, s, "一號")
    ok(start(client, s["activity_id"]))
    live = join_as_guest(client, s, "還在")
    ok(start(client, s["activity_id"]))
    second = join_as_guest(client, s, "二號")
    ok(start(client, s["activity_id"]))
    # Past guest_expires_at but the daily job has not run: already expired.
    expire(first["id"])
    expire(second["id"])
    with storage.transaction() as db:
        # Rename one in the course: numbering follows joining, not names or the listing order.
        row = db.get(Enrollment, enrollment_id(second["id"], course_id))
        row.display_name = "AAA"
    as_teacher(client, s)
    for view in ("progress", "analysis"):
        found = students(client, s, view)
        numbers = {
            account: (
                found[enrollment_id(account, course_id)]["kind"],
                found[enrollment_id(account, course_id)]["guest_number"],
            )
            for account in (first["id"], live["id"], second["id"])
        }
        assert numbers == {
            first["id"]: ("expired_guest", 1),
            live["id"]: ("guest", None),
            second["id"]: ("expired_guest", 2),
        }


def test_joining_at_the_same_moment_is_ordered_by_enrollment_id(client, tutor):
    s = setup(client)
    course_id = s["course"]["id"]
    guests = [join_as_guest(client, s, name) for name in ("甲", "乙")]
    with storage.transaction() as db:
        for guest in guests:
            db.get(Enrollment, enrollment_id(guest["id"], course_id)).created_at = 100.0
    for guest in guests:
        expire(guest["id"])
    as_teacher(client, s)
    found = students(client, s, "progress")
    by_id = sorted(enrollment_id(guest["id"], course_id) for guest in guests)
    assert [found[eid]["guest_number"] for eid in by_id] == [1, 2]


# ---- the guest record hook -----------------------------------------------------------------


def attempts_of(account_id):
    with storage.transaction() as db:
        return [
            (row.id, row.activity_id)
            for row in db.scalars(select(SoloAttempt).where(SoloAttempt.account_id == account_id))
        ]


def messages_of(attempt_id):
    with storage.transaction() as db:
        return db.scalars(
            select(SoloMessage.text).where(SoloMessage.attempt_id == attempt_id)
        ).all()


def test_reassign_moves_an_attempt_only_the_guest_has(client, tutor):
    _, replies = tutor
    s = setup(client)
    guest = join_as_guest(client, s)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(OPENING)
    answer(client, attempt["id"], "我是訪客時說的")
    with storage.transaction() as db:
        guest_records.HOOK.reassign(db, guest["id"], s["student"]["id"])
    assert attempts_of(guest["id"]) == []
    assert attempts_of(s["student"]["id"]) == [(attempt["id"], s["activity_id"])]
    assert "我是訪客時說的" in messages_of(attempt["id"])


def test_reassign_keeps_the_accounts_attempt_and_deletes_the_guests(client, tutor):
    _, replies = tutor
    s = setup(client)
    kept = ok(start(client, s["activity_id"]))
    guest = join_as_guest(client, s)
    dropped = ok(start(client, s["activity_id"]))
    replies.append(OPENING)
    answer(client, dropped["id"], "訪客的那份")
    with storage.transaction() as db:
        guest_records.HOOK.reassign(db, guest["id"], s["student"]["id"])
    assert attempts_of(s["student"]["id"]) == [(kept["id"], s["activity_id"])]
    assert attempts_of(guest["id"]) == []
    assert messages_of(dropped["id"]) == []


def test_forget_name_keeps_every_attempt(client, tutor):
    s = setup(client)
    guest = join_as_guest(client, s)
    attempt = ok(start(client, s["activity_id"]))
    with storage.transaction() as db:
        guest_records.HOOK.forget_name(db, guest["id"])
    assert attempts_of(guest["id"]) == [(attempt["id"], s["activity_id"])]
