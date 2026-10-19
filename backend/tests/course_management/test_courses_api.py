from sqlalchemy import func, select

from app.modules.course_management.repositories.models import Course, Enrollment
from app.modules.course_management.services import courses as course_service
from app.modules.platform.repositories import classroom_storage as storage
from tests.course_management.conftest import PASSWORD, switch, user


def create_course(client, **overrides):
    body = {"name": "科技倫理", "teacher_name": "Fizzy", **overrides}
    response = client.post("/api/v2/courses", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def test_create_defaults_and_code(client):
    user(client)

    course = create_course(client)

    assert course["role"] == "teacher"
    assert len(course["code"]) == 8
    assert course["code_enabled"] is True
    assert "rotate_code" in course["available_actions"]
    assert course["intro"] == ""
    assert course["goals"] == ""


def test_unverified_cannot_create(client):
    response = client.post(
        "/api/v2/auth/register",
        json={
            "username": "pending",
            "email": "pending@example.org",
            "password": PASSWORD,
        },
    )
    client.headers["X-CSRF-Token"] = response.json()["csrf_token"]

    response = client.post("/api/v2/courses", json={"name": "科技倫理", "teacher_name": "Fizzy"})

    assert response.status_code == 403
    assert response.json() == {"detail": "EMAIL_VERIFICATION_REQUIRED"}


def test_csrf_required(client):
    user(client)
    client.headers["X-CSRF-Token"] = "wrong"

    response = client.post("/api/v2/courses", json={"name": "科技倫理", "teacher_name": "Fizzy"})

    assert response.status_code == 403
    assert response.json() == {"detail": "SESSION_CSRF_REQUIRED"}


def test_other_teacher_cannot_read_or_patch(client):
    user(client, "owner")
    course = create_course(client)
    user(client, "other")

    read = client.get(f"/api/v2/courses/{course['id']}")
    update = client.patch(f"/api/v2/courses/{course['id']}", json={"name": "偷改的名稱"})

    assert read.status_code == 404
    assert read.json() == {"detail": "COURSE_NOT_FOUND"}
    assert update.status_code == 404
    assert update.json() == {"detail": "COURSE_NOT_FOUND"}


def test_rotate_code_replaces_persisted_code(client, monkeypatch):
    user(client)
    course = create_course(client)
    replacement = "BCDEFGHJ"
    monkeypatch.setattr(course_service, "new_code", lambda: replacement)

    response = client.post(f"/api/v2/courses/{course['id']}/rotate_code")

    assert response.status_code == 200
    assert response.json()["code"] == replacement
    assert client.get(f"/api/v2/courses/{course['id']}").json()["code"] == replacement
    with storage.transaction() as db:
        assert db.scalar(select(Course).where(Course.code == course["code"])) is None


def test_code_collision_retries_then_succeeds(client, monkeypatch):
    user(client)
    existing = create_course(client)
    replacement = "BCDEFGHJ"
    values = iter([existing["code"], replacement])
    monkeypatch.setattr(course_service, "new_code", lambda: next(values))

    created = create_course(client, name="第二門課")

    assert created["code"] == replacement


def test_code_collision_exhaustion(client, monkeypatch):
    user(client)
    existing = create_course(client)
    monkeypatch.setattr(course_service, "new_code", lambda: existing["code"])
    with storage.transaction() as db:
        before = db.scalar(select(func.count()).select_from(Course))

    response = client.post("/api/v2/courses", json={"name": "第二門課", "teacher_name": "Fizzy"})

    assert response.status_code == 503
    assert response.json() == {"detail": "COURSE_CODE_EXHAUSTED"}
    with storage.transaction() as db:
        assert db.scalar(select(func.count()).select_from(Course)) == before


def test_owner_is_not_auto_enrolled(client):
    owner = user(client, "owner")
    course = create_course(client)

    owner_lists = client.get("/api/v2/courses").json()
    assert [item["id"] for item in owner_lists["teaching"]] == [course["id"]]
    assert owner_lists["learning"] == []
    with storage.transaction() as db:
        assert db.scalar(select(func.count()).select_from(Enrollment)) == 0

    other = user(client, "other")
    assert client.get("/api/v2/courses").json() == {"teaching": [], "learning": []}

    switch(client, owner)
    assert client.get(f"/api/v2/courses/{course['id']}").json()["role"] == "teacher"
    switch(client, other)


def test_student_view_has_code_unless_disabled(client):
    owner = user(client, "owner")
    course = create_course(client)
    student = user(client, "student")
    joined = client.post(
        "/api/v2/courses/join", json={"code": course["code"], "display_name": "學生"}
    )
    assert joined.json()["code"] == course["code"]

    switch(client, owner)
    assert client.post(f"/api/v2/courses/{course['id']}/disable_code").status_code == 200
    switch(client, student)
    assert client.get(f"/api/v2/courses/{course['id']}").json()["code"] is None

    switch(client, owner)
    assert client.post(f"/api/v2/courses/{course['id']}/enable_code").status_code == 200
    switch(client, student)
    assert client.get(f"/api/v2/courses/{course['id']}").json()["code"] == course["code"]
