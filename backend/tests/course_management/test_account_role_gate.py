"""The account role guards the three course entry points and nothing else.

A student account cannot create a course; a teacher account cannot join a course or an activity.
Everything inside a course keeps checking membership, so blocking the entries is enough.
"""

from sqlalchemy import func, select

from app.modules.course_management.repositories import Course, Enrollment
from app.modules.platform import storage as storage
from tests.course_management.conftest import user
from tests.course_management.test_activities_api import act, create_activity
from tests.course_management.test_courses_api import create_course

FORBIDDEN = (403, {"detail": "ACCOUNT_ROLE_FORBIDDEN"})


def count(model):
    with storage.transaction() as db:
        return db.scalar(select(func.count()).select_from(model))


def open_activity(client):
    user(client, "owner", account_role="teacher")
    course = create_course(client)
    activity = create_activity(client, course["id"])
    assert act(client, activity["id"], "publish").status_code == 200
    return course, activity


def test_a_student_account_cannot_create_a_course(client):
    user(client, "ming", account_role="student")
    r = client.post("/api/v2/courses", json={"name": "科技倫理", "teacher_name": "明"})
    assert (r.status_code, r.json()) == FORBIDDEN
    assert count(Course) == 0


def test_a_teacher_account_creates_a_course(client):
    user(client, "owner", account_role="teacher")
    assert create_course(client)["name"] == "科技倫理"


def test_a_teacher_account_cannot_join_a_course(client):
    course, _ = open_activity(client)
    user(client, "colleague", account_role="teacher")
    r = client.post("/api/v2/courses/join", json={"code": course["code"], "display_name": "王"})
    assert (r.status_code, r.json()) == FORBIDDEN
    assert count(Enrollment) == 0


def test_a_teacher_account_is_refused_before_the_code_is_looked_up(client):
    user(client, "colleague", account_role="teacher")
    r = client.post("/api/v2/courses/join", json={"code": "NOPE0000", "display_name": "王"})
    assert (r.status_code, r.json()) == FORBIDDEN


def test_a_teacher_account_cannot_join_an_activity(client):
    _, activity = open_activity(client)
    user(client, "colleague", account_role="teacher")
    r = client.post(f"/api/v2/activities/{activity['id']}/join", json={"display_name": "王"})
    assert (r.status_code, r.json()) == FORBIDDEN
    assert count(Enrollment) == 0


def test_a_student_account_joins_a_course_and_an_activity(client):
    course, activity = open_activity(client)
    user(client, "ming", account_role="student")
    joined = client.post(
        "/api/v2/courses/join", json={"code": course["code"], "display_name": "明"}
    )
    assert joined.status_code == 200, joined.text
    r = client.post(f"/api/v2/activities/{activity['id']}/join", json={"display_name": "明"})
    assert r.status_code == 200, r.text


def test_a_teacher_account_may_still_preview_a_course_and_an_activity(client):
    course, activity = open_activity(client)
    user(client, "colleague", account_role="teacher")
    assert client.get(f"/api/v2/course-join/preview?code={course['code']}").status_code == 200
    assert client.get(f"/api/v2/activities/{activity['id']}/join-preview").status_code == 200
