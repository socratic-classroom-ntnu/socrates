from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, func, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.classroom_app import create_app
from app.modules.identity_access.services import classroom_auth as auth
from app.modules.course_management.repositories.models import Course, Enrollment
from app.modules.platform.classroom_env import env_str
from app.modules.platform.repositories import classroom_storage as storage
from app.modules.platform.repositories.classroom_storage import Membership
from tests.course_management.conftest import user
from tests.course_management.test_courses_api import create_course

TEST_DIALECT = make_url(env_str("CLASSROOM_TEST_DATABASE_URL", "sqlite://")).get_backend_name()


def join(client, code: str, display_name: str = "學生"):
    return client.post(
        "/api/v2/courses/join",
        json={"code": code, "display_name": display_name},
    )


def test_join_twice_is_idempotent(client):
    user(client, "owner")
    course = create_course(client)
    user(client, "student")

    first = join(client, course["code"], "第一次")
    second = join(client, course["code"], "第二次")

    assert first.status_code == second.status_code == 200
    assert first.json()["display_name"] == "第一次"
    assert second.json()["display_name"] == "第一次"
    with storage.transaction() as db:
        assert db.scalar(select(func.count()).select_from(Enrollment)) == 1


@pytest.mark.skipif(TEST_DIALECT != "postgresql", reason="requires PostgreSQL transactions")
def test_concurrent_join_is_idempotent(client):
    user(client, "owner")
    course = create_course(client)
    account = user(client, "student")
    cookie = client.cookies.get(auth.COOKIE)
    assert cookie is not None
    barrier = Barrier(2)

    def meet_before_enrollment_insert(session, _flush_context, _instances):
        if any(isinstance(row, Enrollment) for row in session.new):
            barrier.wait(timeout=5)

    event.listen(Session, "before_flush", meet_before_enrollment_insert)
    try:
        clients = [
            TestClient(
                create_app(background=False),
                cookies={auth.COOKIE: cookie},
                headers={"X-CSRF-Token": account["csrf_token"]},
            )
            for _ in range(2)
        ]
        with clients[0], clients[1], ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(
                pool.map(
                    lambda item: join(item[0], course["code"], item[1]),
                    zip(clients, ["左", "右"]),
                )
            )
    finally:
        event.remove(Session, "before_flush", meet_before_enrollment_insert)

    assert [response.status_code for response in responses] == [200, 200]
    assert responses[0].json()["id"] == responses[1].json()["id"] == course["id"]
    with storage.transaction() as db:
        assert db.scalar(select(func.count()).select_from(Enrollment)) == 1


def test_join_normalizes_code(client):
    user(client, "owner")
    course = create_course(client)
    with storage.transaction() as db:
        db.get(Course, course["id"]).code = "3CKTGE7Q"
    user(client, "student")

    response = join(client, " 3cktge7q ")

    assert response.status_code == 200
    assert response.json()["id"] == course["id"]


def test_wrong_or_disabled_code_same_error(client):
    user(client, "owner")
    course = create_course(client)
    client.post(f"/api/v2/courses/{course['id']}/disable_code")
    user(client, "student")

    wrong = join(client, "XXXXXXXX")
    disabled = join(client, course["code"])

    assert wrong.status_code == disabled.status_code == 404
    assert wrong.json() == disabled.json() == {"detail": "ENROLL_CODE_NOT_FOUND"}
    assert course["name"] not in wrong.text + disabled.text


def test_course_and_room_code_namespaces_are_independent(client):
    user(client, "owner")
    course = create_course(client)
    script = client.post(
        "/api/v2/scripts",
        json={
            "document": {
                "title": "倫理",
                "questions": [
                    {
                        "id": "q",
                        "title": "題目",
                        "scenario": "抉擇",
                        "options": [
                            {"id": "a", "text": "甲"},
                            {"id": "b", "text": "乙"},
                        ],
                    }
                ],
            }
        },
    ).json()
    room = client.post("/api/v2/classrooms", json={"script_id": script["id"]}).json()
    shared_code = "ABCDEFGH"
    with storage.transaction() as db:
        db.get(Course, course["id"]).code = shared_code
        db.get(storage.Room, room["id"]).code = shared_code
    user(client, "student")

    course_join = join(client, shared_code)
    room_join = client.post(
        "/api/v2/classrooms/join",
        json={"code": shared_code, "alias": "學生", "avatar": "scholar"},
    )

    assert course_join.status_code == room_join.status_code == 200
    with storage.transaction() as db:
        assert db.scalar(select(func.count()).select_from(Enrollment)) == 1
        # Creating the room already gave the teacher a Membership; the student join adds one.
        assert (
            db.scalar(
                select(func.count()).select_from(Membership).where(Membership.role == "student")
            )
            == 1
        )


def test_join_rate_limited(client):
    user(client, "student")

    responses = [join(client, "XXXXXXXX") for _ in range(21)]

    assert all(response.status_code == 404 for response in responses[:20])
    assert responses[20].status_code == 429
    assert responses[20].json() == {"detail": "RATE_LIMITED"}


def test_preview_shows_course_without_enrolling(client):
    user(client, "owner")
    course = create_course(client)
    account = user(client, "student")

    response = client.get("/api/v2/course-join/preview", params={"code": course["code"]})

    assert response.status_code == 200
    assert response.json()["already_enrolled"] is False
    assert response.json()["default_display_name"] == account["username"]
    with storage.transaction() as db:
        assert db.scalar(select(func.count()).select_from(Enrollment)) == 0


def test_owner_can_enroll_as_student(client):
    user(client, "owner")
    course = create_course(client)

    joined = join(client, course["code"], "老師的學生視角")

    assert joined.status_code == 200
    assert joined.json()["role"] == "student"
    lists = client.get("/api/v2/courses").json()
    assert [item["id"] for item in lists["teaching"]] == [course["id"]]
    assert [item["id"] for item in lists["learning"]] == [course["id"]]
    assert client.get(f"/api/v2/courses/{course['id']}").json()["role"] == "teacher"
    assert client.get(f"/api/v2/courses/{course['id']}?role=student").json()["role"] == "student"
    with storage.transaction() as db:
        assert db.scalar(select(func.count()).select_from(Enrollment)) == 1
