"""DELETE /courses/{id}/students/{enrollment_id}: the course owner removes a student; the
enrollment and every answer of theirs in the course are deleted for good, and the student may
join again as a newcomer (spec P3, P6, P9, P16)."""

from sqlalchemy import func, select

from app.modules.course_management import enrollment as enrollment_service
from app.modules.course_management.repositories import Course, Enrollment
from app.modules.platform import storage as storage
from app.modules.solo_activity.repositories import SoloAttempt, SoloMessage
from tests.course_management.conftest import switch, user
from tests.course_management.test_courses_api import create_course
from tests.solo_activity.conftest import tutor  # noqa: F401  the scripted provider
from tests.solo_activity.test_solo_attempts_api import OPENING, answer, do, join, ok, setup, start
from tests.solo_activity.test_solo_guests import expire, join_as_guest, as_teacher


def remove(client, course_id, enrollment_id):
    return client.delete(f"/api/v2/courses/{course_id}/students/{enrollment_id}")


def enrollment_of(account_id, course_id):
    with storage.transaction() as db:
        return db.scalar(
            select(Enrollment.id).where(
                Enrollment.account_id == account_id, Enrollment.course_id == course_id
            )
        )


def rows(model, **where):
    with storage.transaction() as db:
        query = select(func.count()).select_from(model)
        for column, value in where.items():
            query = query.where(getattr(model, column) == value)
        return db.scalar(query)


def answered(client, replies, activity_id):
    attempt = ok(start(client, activity_id))
    replies.append(OPENING)
    answer(client, attempt["id"])
    return attempt["id"]


def test_the_owner_removes_a_student_and_every_answer_of_theirs(client, tutor):  # noqa: F811
    _, replies = tutor
    s = setup(client)
    course_id = s["course"]["id"]
    attempt_id = answered(client, replies, s["activity_id"])
    target = enrollment_of(s["student"]["id"], course_id)

    switch(client, s["teacher"])
    assert ok(client.get(f"/api/v2/courses/{course_id}"))["student_count"] == 1
    response = remove(client, course_id, target)
    assert response.status_code == 204, response.text

    assert enrollment_of(s["student"]["id"], course_id) is None
    assert rows(SoloAttempt, id=attempt_id) == 0
    assert rows(SoloMessage, attempt_id=attempt_id) == 0
    assert ok(client.get(f"/api/v2/courses/{course_id}"))["student_count"] == 0


def test_only_the_owner_may_remove(client, tutor):  # noqa: F811
    s = setup(client)
    course_id = s["course"]["id"]
    target = enrollment_of(s["student"]["id"], course_id)

    # The student themself.
    response = remove(client, course_id, target)
    assert (response.status_code, response.json()) == (404, {"detail": "COURSE_NOT_FOUND"})

    # Another teacher, and a stranger.
    user(client, "other", account_role="teacher")
    create_course(client)
    response = remove(client, course_id, target)
    assert (response.status_code, response.json()) == (404, {"detail": "COURSE_NOT_FOUND"})
    user(client, "outsider")
    response = remove(client, course_id, target)
    assert (response.status_code, response.json()) == (404, {"detail": "COURSE_NOT_FOUND"})

    # A guest is stopped before the course is looked at, as on every teacher endpoint.
    join_as_guest(client, s)
    response = remove(client, course_id, target)
    assert (response.status_code, response.json()) == (403, {"detail": "GUEST_NOT_ALLOWED"})

    assert enrollment_of(s["student"]["id"], course_id) == target


def test_an_enrollment_of_another_course_or_gone_is_not_found(client, tutor):  # noqa: F811
    s = setup(client)
    course_id = s["course"]["id"]
    target = enrollment_of(s["student"]["id"], course_id)

    switch(client, s["teacher"])
    other = create_course(client, name="另一門課")
    switch(client, s["student"])
    body = {"code": other["code"], "display_name": "student同學"}
    assert client.post("/api/v2/courses/join", json=body).status_code == 200
    elsewhere = enrollment_of(s["student"]["id"], other["id"])

    switch(client, s["teacher"])
    for course, enrollment_id in (
        (course_id, elsewhere),
        (course_id, "missing"),
        (other["id"], target),
    ):
        response = remove(client, course, enrollment_id)
        assert (response.status_code, response.json()) == (404, {"detail": "ENROLLMENT_NOT_FOUND"})

    assert remove(client, course_id, target).status_code == 204
    response = remove(client, course_id, target)
    assert (response.status_code, response.json()) == (404, {"detail": "ENROLLMENT_NOT_FOUND"})
    assert enrollment_of(s["student"]["id"], other["id"]) == elsewhere


def test_the_owners_own_enrollment_is_not_a_student(client, tutor):  # noqa: F811
    s = setup(client)
    course_id = s["course"]["id"]
    switch(client, s["teacher"])
    with storage.transaction() as db:
        owned = Enrollment(course_id=course_id, account_id=s["teacher"]["id"], display_name="老師")
        db.add(owned)
        db.flush()
        owned_id = owned.id
    response = remove(client, course_id, owned_id)
    assert (response.status_code, response.json()) == (404, {"detail": "ENROLLMENT_NOT_FOUND"})


def test_a_removed_student_loses_the_course_everywhere(client, tutor):  # noqa: F811
    _, replies = tutor
    s = setup(client)
    course_id = s["course"]["id"]
    attempt_id = answered(client, replies, s["activity_id"])
    switch(client, s["teacher"])
    assert (
        remove(client, course_id, enrollment_of(s["student"]["id"], course_id)).status_code == 204
    )

    switch(client, s["student"])
    lists = ok(client.get("/api/v2/courses"))
    assert course_id not in {
        c["id"] for group in lists.values() if isinstance(group, list) for c in group
    }
    response = client.get(f"/api/v2/courses/{course_id}")
    assert (response.status_code, response.json()) == (404, {"detail": "COURSE_NOT_FOUND"})
    response = client.get(f"/api/v2/solo/activities/{s['activity_id']}")
    assert (response.status_code, response.json()) == (404, {"detail": "ACTIVITY_NOT_FOUND"})
    for response in (
        client.get(f"/api/v2/solo/attempts/{attempt_id}"),
        do(client, attempt_id, "send_message", {"text": "還想再說一句"}),
    ):
        assert (response.status_code, response.json()) == (
            404,
            {"detail": "SOLO_ATTEMPT_NOT_FOUND"},
        )


def test_a_removed_student_may_join_again_from_scratch(client, tutor):  # noqa: F811
    _, replies = tutor
    s = setup(client)
    course_id = s["course"]["id"]
    old_attempt = answered(client, replies, s["activity_id"])
    switch(client, s["teacher"])
    assert (
        remove(client, course_id, enrollment_of(s["student"]["id"], course_id)).status_code == 204
    )

    switch(client, s["student"])
    body = {"code": s["course"]["code"], "display_name": "student同學"}
    assert client.post("/api/v2/courses/join", json=body).status_code == 200
    fresh = ok(start(client, s["activity_id"]))
    assert fresh["id"] != old_attempt
    assert fresh["messages"] == []


def test_guests_and_expired_guests_can_be_removed(client, tutor):  # noqa: F811
    _, replies = tutor
    s = setup(client)
    course_id = s["course"]["id"]
    guest = join_as_guest(client, s)
    guest_attempt = answered(client, replies, s["activity_id"])
    gone = join_as_guest(client, s, nickname="好奇的海獺")
    expire(gone["id"])

    as_teacher(client, s)
    for account in (guest, gone):
        response = remove(client, course_id, enrollment_of(account["id"], course_id))
        assert response.status_code == 204, response.text
    assert rows(SoloAttempt, id=guest_attempt) == 0
    assert enrollment_of(guest["id"], course_id) is None
    assert enrollment_of(gone["id"], course_id) is None


def test_the_teachers_views_forget_a_removed_student(client, tutor):  # noqa: F811
    _, replies = tutor
    s = setup(client)
    course_id = s["course"]["id"]
    answered(client, replies, s["activity_id"])
    join(client, s["course"], "peer")
    answered(client, replies, s["activity_id"])

    switch(client, s["teacher"])
    before = ok(client.get(f"/api/v2/solo/activities/{s['activity_id']}/progress"))
    assert before["summary"]["started"] == 2
    target = enrollment_of(s["student"]["id"], course_id)
    assert remove(client, course_id, target).status_code == 204

    progress = ok(client.get(f"/api/v2/solo/activities/{s['activity_id']}/progress"))
    assert target not in {item["enrollment_id"] for item in progress["students"]}
    assert (progress["summary"]["enrolled"], progress["summary"]["started"]) == (1, 1)
    analysis = ok(client.get(f"/api/v2/solo/activities/{s['activity_id']}/analysis"))
    assert target not in {item["enrollment_id"] for item in analysis["students"]}


def test_removing_an_earlier_expired_guest_renumbers_the_later_one(client, tutor):  # noqa: F811
    s = setup(client)
    course_id = s["course"]["id"]
    first = join_as_guest(client, s)
    second = join_as_guest(client, s, nickname="好奇的海獺")
    expire(first["id"])
    expire(second["id"])

    as_teacher(client, s)
    assert remove(client, course_id, enrollment_of(first["id"], course_id)).status_code == 204
    progress = ok(client.get(f"/api/v2/solo/activities/{s['activity_id']}/progress"))
    later = next(
        i
        for i in progress["students"]
        if i["enrollment_id"] == enrollment_of(second["id"], course_id)
    )
    assert (later["kind"], later["guest_number"]) == ("expired_guest", 1)


def test_a_reply_arriving_after_the_removal_writes_nothing(client, tutor):  # noqa: F811
    _, replies = tutor
    s = setup(client)
    course_id = s["course"]["id"]
    attempt = ok(start(client, s["activity_id"]))
    target = enrollment_of(s["student"]["id"], course_id)

    def removed_while_the_tutor_thinks():
        # The provider call runs outside the transaction that saved the student's message.
        with storage.transaction() as db:
            course = db.get(Course, course_id)
            enrollment_service.remove_student(db, course, target)
        return OPENING

    replies.append(removed_while_the_tutor_thinks)
    response = do(client, attempt["id"], "send_message", {"text": "不能主動害人"})
    assert (response.status_code, response.json()) == (404, {"detail": "SOLO_ATTEMPT_NOT_FOUND"})
    assert rows(SoloAttempt, id=attempt["id"]) == 0
    assert rows(SoloMessage, attempt_id=attempt["id"]) == 0
