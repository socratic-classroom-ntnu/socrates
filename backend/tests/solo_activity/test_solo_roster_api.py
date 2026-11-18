"""GET /solo/courses/{id}/students: the course owner's roster (spec P1, P4, P7, P10, P12, P16).

Every enrolled student, guests and expired guests included, newest 最近活動 first; 最近活動 is the
latest update or message of any of the student's attempts in the course (as on the live page), and
活動進度 counts completed attempts among the course's open and ended activities only."""

import time

from sqlalchemy import select

from app.modules.course_management.repositories import Activity, Enrollment
from app.modules.platform import storage as storage
from app.modules.solo_activity.repositories import SoloAttempt, SoloMessage
from tests.course_management.conftest import switch, user
from tests.course_management.test_activities_api import act, create_activity
from tests.course_management.test_courses_api import create_course
from tests.solo_activity.test_solo_attempts_api import OPENING, answer, join, ok, setup, start
from tests.solo_activity.test_solo_guests import as_teacher, expire, join_as_guest


def roster(client, course_id):
    return client.get(f"/api/v2/solo/courses/{course_id}/students")


def published(client, course_id, title):
    body = create_activity(client, course_id, title=title)
    assert act(client, body["id"], "publish").status_code == 200
    return body["id"]


def set_times(activity_id, **times):
    with storage.transaction() as db:
        row = db.get(Activity, activity_id)
        for name, value in times.items():
            setattr(row, name, value)


def finish(attempt_id, updated_at=None):
    with storage.transaction() as db:
        row = db.get(SoloAttempt, attempt_id)
        row.state = "completed"
        if updated_at is not None:
            row.updated_at = updated_at


def touch(attempt_id, updated_at, message_at=None):
    """Pin an attempt's update time, and every one of its messages to message_at (or earlier)."""
    with storage.transaction() as db:
        db.get(SoloAttempt, attempt_id).updated_at = updated_at
        for message in db.scalars(select(SoloMessage).where(SoloMessage.attempt_id == attempt_id)):
            message.created_at = message_at if message_at is not None else updated_at - 100


def enrollment_of(account_id, course_id):
    with storage.transaction() as db:
        return db.scalar(
            select(Enrollment.id).where(
                Enrollment.account_id == account_id, Enrollment.course_id == course_id
            )
        )


def by_id(view):
    return {item["enrollment_id"]: item for item in view["students"]}


def test_only_the_course_owner_reads_the_roster(client, tutor):
    s = setup(client)
    course_id = s["course"]["id"]

    response = roster(client, course_id)
    assert (response.status_code, response.json()) == (404, {"detail": "COURSE_NOT_FOUND"})
    user(client, "other", account_role="teacher")
    create_course(client)
    response = roster(client, course_id)
    assert (response.status_code, response.json()) == (404, {"detail": "COURSE_NOT_FOUND"})
    user(client, "outsider")
    response = roster(client, course_id)
    assert (response.status_code, response.json()) == (404, {"detail": "COURSE_NOT_FOUND"})
    join_as_guest(client, s)
    response = roster(client, course_id)
    assert (response.status_code, response.json()) == (403, {"detail": "GUEST_NOT_ALLOWED"})

    as_teacher(client, s)
    assert roster(client, course_id).status_code == 200
    response = roster(client, "missing")
    assert (response.status_code, response.json()) == (404, {"detail": "COURSE_NOT_FOUND"})


def test_who_is_on_the_roster_and_what_it_shows(client, tutor):
    s = setup(client)
    course_id = s["course"]["id"]
    guest = join_as_guest(client, s)
    gone = join_as_guest(client, s, nickname="好奇的海獺")
    expire(gone["id"])
    as_teacher(client, s)
    with storage.transaction() as db:
        db.add(Enrollment(course_id=course_id, account_id=s["teacher"]["id"], display_name="老師"))

    view = ok(roster(client, course_id))
    students = by_id(view)
    assert view["course_id"] == course_id
    assert (
        enrollment_of(s["teacher"]["id"], course_id) not in students
    )  # the owner is not a student
    assert view["summary"] == {"total": 3, "registered": 1, "guests": 1, "expired_guests": 1}

    registered = students[enrollment_of(s["student"]["id"], course_id)]
    assert registered["kind"] == "registered"
    assert registered["display_name"] == "student同學"
    assert registered["email"] == "student@example.org"
    assert registered["guest_number"] is None
    assert isinstance(registered["joined_at"], float)

    visitor = students[enrollment_of(guest["id"], course_id)]
    assert (visitor["kind"], visitor["email"], visitor["display_name"]) == (
        "guest",
        None,
        "安靜的貓頭鷹",
    )

    expired = students[enrollment_of(gone["id"], course_id)]
    # Past guest_expires_at, before the daily job clears the name: shown as 過期訪客 N by its kind.
    assert (expired["kind"], expired["guest_number"], expired["email"]) == (
        "expired_guest",
        1,
        None,
    )

    text = roster(client, course_id).text
    assert "username" not in text and "expired-guest-" not in text


def test_progress_counts_only_open_and_ended_activities(client, tutor):
    _, replies = tutor
    s = setup(client)
    course_id = s["course"]["id"]
    open_a = s["activity_id"]
    switch(client, s["teacher"])
    ended_b = published(client, course_id, "已結束的活動：電車難題第二題")
    scheduled_c = published(client, course_id, "排程中的活動：還沒開始")
    create_activity(client, course_id, title="草稿活動：還沒發布")
    deleted_e = published(client, course_id, "之後會被刪除的活動")

    switch(client, s["student"])
    attempts = {}
    for activity_id in (open_a, ended_b, deleted_e):
        attempts[activity_id] = ok(start(client, activity_id))["id"]
    finish(attempts[open_a])
    finish(attempts[deleted_e])

    now = time.time()
    set_times(ended_b, ends_at=now - 10)
    set_times(scheduled_c, starts_at=now + 3600, ends_at=now + 7200)
    with storage.transaction() as db:
        db.get(Activity, deleted_e).deleted = True

    switch(client, s["teacher"])
    view = ok(roster(client, course_id))
    assert view["counted_activities"] == 2
    student = by_id(view)[enrollment_of(s["student"]["id"], course_id)]
    assert student["completed_activities"] == 1


def test_last_activity_is_the_latest_of_any_attempt_in_the_course(client, tutor):
    _, replies = tutor
    s = setup(client)
    course_id = s["course"]["id"]
    switch(client, s["teacher"])
    later = published(client, course_id, "第二個活動：天橋上的陌生人")
    deleted = published(client, course_id, "第三個活動：之後會被刪除")

    switch(client, s["student"])
    first = ok(start(client, s["activity_id"]))["id"]
    replies.append(OPENING)
    answer(client, first)
    second = ok(start(client, later))["id"]
    third = ok(start(client, deleted))["id"]

    base = time.time() - 10_000
    touch(first, base + 100, message_at=base + 500)  # a message later than the attempt's update
    touch(second, base + 300)
    touch(third, base + 900)  # the latest of all, in an activity deleted afterwards
    with storage.transaction() as db:
        db.get(Activity, deleted).deleted = True

    switch(client, s["teacher"])
    student = by_id(ok(roster(client, course_id)))[enrollment_of(s["student"]["id"], course_id)]
    assert student["last_activity_at"] == base + 900

    with storage.transaction() as db:
        db.get(Activity, deleted).deleted = False
    touch(third, base + 50)
    student = by_id(ok(roster(client, course_id)))[enrollment_of(s["student"]["id"], course_id)]
    assert student["last_activity_at"] == base + 500


def test_newest_activity_first_and_the_idle_last_by_joining_order(client, tutor):
    s = setup(client)
    course_id = s["course"]["id"]
    join(client, s["course"], "quiet1")
    join(client, s["course"], "busy")
    busy_attempt = ok(start(client, s["activity_id"]))["id"]
    join(client, s["course"], "quiet2")
    switch(client, s["student"])
    early_attempt = ok(start(client, s["activity_id"]))["id"]
    touch(busy_attempt, time.time() - 10)
    touch(early_attempt, time.time() - 1000)

    switch(client, s["teacher"])
    names = [item["display_name"] for item in ok(roster(client, course_id))["students"]]
    assert names == ["busy同學", "student同學", "quiet1同學", "quiet2同學"]
    idle = [
        item
        for item in ok(roster(client, course_id))["students"]
        if item["last_activity_at"] is None
    ]
    assert [item["display_name"] for item in idle] == ["quiet1同學", "quiet2同學"]
    assert all(item["completed_activities"] == 0 for item in idle)


def test_no_message_text_or_summary_leaks(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(OPENING)
    answer(client, attempt["id"], "非常私密的理由")
    switch(client, s["teacher"])
    response = roster(client, s["course"]["id"])
    assert response.status_code == 200, response.text
    text = response.text
    assert "非常私密的理由" not in text
    assert OPENING["reply_text"] not in text
    assert OPENING["summary"]["reason_summary"] not in text
