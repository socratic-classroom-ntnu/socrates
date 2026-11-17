"""solo-activity's enrollment record hook: removing a student from a course deletes their attempts
and messages in every activity of that course (soft-deleted ones too), and nothing else."""

from sqlalchemy import func, select

from app.modules.course_management.repositories import Activity
from app.modules.platform import storage as storage
from app.modules.solo_activity.enrollment_records import HOOK
from app.modules.solo_activity.repositories import SoloAttempt, SoloMessage
from tests.course_management.conftest import switch
from tests.course_management.test_activities_api import act, create_activity
from tests.course_management.test_courses_api import create_course
from tests.solo_activity.test_solo_attempts_api import OPENING, answer, join, ok, setup, start


def published(client, course_id, title="第二個情境：天橋上的陌生人與電車"):
    body = create_activity(client, course_id, title=title)
    assert act(client, body["id"], "publish").status_code == 200
    return body["id"]


def attempt_with_message(client, replies, activity_id):
    attempt = ok(start(client, activity_id))
    replies.append(OPENING)
    answer(client, attempt["id"])
    return attempt["id"]


def exists(attempt_id: str) -> tuple[bool, int]:
    with storage.transaction() as db:
        messages = db.scalar(
            select(func.count())
            .select_from(SoloMessage)
            .where(SoloMessage.attempt_id == attempt_id)
        )
        return db.get(SoloAttempt, attempt_id) is not None, messages


def test_removes_every_attempt_of_the_student_in_that_course_only(client, tutor):
    _, replies = tutor
    s = setup(client)
    course_id = s["course"]["id"]

    switch(client, s["teacher"])
    second = published(client, course_id)
    gone_later = published(client, course_id, title="第三個情境：之後會被刪掉的活動")
    other_course = create_course(client, name="另一門課")
    elsewhere = published(client, other_course["id"])

    switch(client, s["student"])
    first_attempt = attempt_with_message(client, replies, s["activity_id"])
    second_attempt = attempt_with_message(client, replies, second)
    deleted_attempt = attempt_with_message(client, replies, gone_later)
    assert (
        client.post(
            "/api/v2/courses/join",
            json={"code": other_course["code"], "display_name": "student同學"},
        ).status_code
        == 200
    )
    elsewhere_attempt = attempt_with_message(client, replies, elsewhere)

    join(client, s["course"], "peer")
    peer_attempt = attempt_with_message(client, replies, s["activity_id"])

    with storage.transaction() as db:
        db.get(Activity, gone_later).deleted = True

    with storage.transaction() as db:
        HOOK.remove(db, course_id, s["student"]["id"])

    for attempt_id in (first_attempt, second_attempt, deleted_attempt):
        assert exists(attempt_id) == (False, 0)
    assert exists(elsewhere_attempt)[0] is True
    assert exists(elsewhere_attempt)[1] > 0
    assert exists(peer_attempt)[0] is True
    assert exists(peer_attempt)[1] > 0


def test_a_student_without_attempts_is_a_no_op(client, tutor):
    s = setup(client)
    with storage.transaction() as db:
        HOOK.remove(db, s["course"]["id"], s["student"]["id"])
    with storage.transaction() as db:
        assert db.scalar(select(func.count()).select_from(SoloAttempt)) == 0
