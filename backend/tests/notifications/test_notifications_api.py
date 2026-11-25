import time

import pytest
from sqlalchemy import select

from app.modules.course_management.repositories import Activity, Course, Enrollment
from app.modules.identity_access.repositories import Account
from app.modules.platform import storage
from tests.admin.test_admin_api import make_admin
from tests.course_management.conftest import switch, user
from tests.course_management.test_guest_join import guest_join, leave, teacher_course

ADMIN = "/api/v2/admin/announcements"
NOTIFICATIONS = "/api/v2/notifications"
DRAFT = {"audience": "all", "title": "Maintenance", "content": "First line\nSecond line"}
WINDOW = {
    "maintenance_date": "2026-12-12",
    "maintenance_start": "00:00",
    "maintenance_end": "06:00",
}


def publish(client, **fields):
    response = client.post(ADMIN, json={**DRAFT, **fields})
    assert response.status_code == 201, response.text
    return response.json()


def notifications(client):
    response = client.get(NOTIFICATIONS)
    assert response.status_code == 200, response.text
    return {item["id"]: item for item in response.json()}


def mark(client, key):
    assert client.post(NOTIFICATIONS + "/read", json={"id": key}).status_code == 204


def test_admin_can_publish_list_and_delete(client):
    user(client, "fizzy", account_role="teacher")
    make_admin("fizzy")
    first = publish(client, **WINDOW)
    second = publish(client, title="New update")
    assert first["published_by_username"] == "fizzy"
    assert {key: first[key] for key in WINDOW} == WINDOW
    assert first["content"] == DRAFT["content"]
    assert client.get(ADMIN).json() == [second, first]
    assert client.delete(f"{ADMIN}/{first['id']}").status_code == 204
    assert client.get(ADMIN).json() == [second]


def test_a_deleted_publisher_has_no_name(client):
    other = user(client, "boss", account_role="teacher")
    make_admin("boss")
    user(client, "fizzy", account_role="teacher")
    make_admin("fizzy")
    publish(client)
    deleted = client.request("DELETE", "/api/v2/account", json={"username": "fizzy"})
    assert deleted.status_code == 200, deleted.text

    switch(client, other)
    [row] = client.get(ADMIN).json()
    assert row["published_by_username"] is None


@pytest.mark.parametrize(
    "fields",
    [
        {"title": " "},
        {"title": "字" * 41},
        {"content": ""},
        {"content": "字" * 501},
        {"audience": "visitor"},
        {"maintenance_date": WINDOW["maintenance_date"]},
        {**WINDOW, "maintenance_end": "00:00"},
        {**WINDOW, "maintenance_start": "23:00"},
        {**WINDOW, "maintenance_date": "2026-02-30"},
        {**WINDOW, "maintenance_start": "0:00"},
    ],
)
def test_announcement_validation(client, fields):
    user(client, "fizzy")
    make_admin("fizzy")
    response = client.post(ADMIN, json={**DRAFT, **fields})
    assert (response.status_code, response.json()["detail"]) == (422, "ANNOUNCEMENT_INVALID")


@pytest.mark.parametrize("role", ["signed-out", "teacher", "student", "guest"])
def test_admin_guard_precedes_validation_and_csrf(client, role):
    if role == "guest":
        _, course = teacher_course(client)
        leave(client)
        assert guest_join(client, course["code"]).status_code < 300
    elif role != "signed-out":
        user(client, "ordinary", account_role=role)
    client.headers.pop("X-CSRF-Token", None)
    for response in (
        client.get(ADMIN),
        client.post(ADMIN, json={"title": 123}),
        client.post(ADMIN, content="{broken", headers={"content-type": "application/json"}),
        client.post(ADMIN, content=b'"\xff"', headers={"content-type": "application/json"}),
        client.delete(f"{ADMIN}/unknown"),
    ):
        assert (response.status_code, response.json()["detail"]) == (404, "ADMIN_NOT_FOUND")


def test_announcement_visibility_read_rules_and_order(client):
    student = user(client, "student")
    teacher, course = teacher_course(client)
    admin = user(client, "fizzy", account_role="teacher")
    make_admin("fizzy")
    keys = {
        audience: "announcement:" + publish(client, audience=audience)["id"]
        for audience in ("all", "teacher", "student")
    }
    mine = notifications(client)
    assert list(mine) == [keys["teacher"], keys["all"]]
    assert all(item["read"] and not item["pop_up"] for item in mine.values())
    switch(client, student)
    rows = notifications(client)
    assert list(rows) == [keys["student"], keys["all"]]
    assert all(not item["read"] and item["pop_up"] for item in rows.values())
    switch(client, teacher)
    assert list(notifications(client)) == [keys["teacher"], keys["all"]]
    user(client, "newstudent")
    assert all(item["read"] and not item["pop_up"] for item in notifications(client).values())
    switch(client, admin)
    leave(client)
    guest_join(client, course["code"])
    assert list(notifications(client)) == [keys["student"], keys["all"]]


def test_guest_expiry_boundary_and_formal_accounts(client, monkeypatch):
    _, course = teacher_course(client)
    leave(client)
    guest = guest_join(client, course["code"]).json()["account"]
    now = time.time()
    with storage.transaction() as db:
        db.get(Account, guest["id"]).guest_expires_at = now + 86400
    monkeypatch.setattr(time, "time", lambda: now)
    assert "guest_expiry" not in notifications(client)
    with storage.transaction() as db:
        db.get(Account, guest["id"]).guest_expires_at -= 1
    expiry = notifications(client)["guest_expiry"]
    assert expiry["time"] == now - 1
    assert expiry["guest_expires_at"] == now + 86399
    assert not expiry["pop_up"]
    with storage.transaction() as db:
        account = db.get(Account, guest["id"])
        account.kind = "registered"
        account.verified = True
    assert "guest_expiry" not in notifications(client)


def test_activity_notifications_follow_current_schedule_and_enrollment(client):
    teacher = user(client, "owner", account_role="teacher")
    student = user(client, "student")
    now = time.time()
    with storage.transaction() as db:
        course = Course(owner_id=teacher["id"], name="Ethics", teacher_name="Owner", code="ETHICS")
        practice = Course(
            owner_id=teacher["id"],
            name="Practice",
            teacher_name="Owner",
            code="PRACTICE",
            practice_account_id=student["id"],
        )
        db.add_all([course, practice])
        db.flush()
        course_id = course.id
        for enrolled_course in (course, practice):
            db.add(
                Enrollment(
                    course_id=enrolled_course.id,
                    account_id=student["id"],
                    display_name="Student",
                    created_at=now - 100,
                )
            )
        defaults = dict(
            course_id=course.id,
            draft={},
            starts_at=now - 10,
            ends_at=now + 10,
            published_at=now - 200,
        )
        cases = {
            "open": {},
            "ended": {"ends_at": now - 1},
            "future": {"starts_at": now + 2},
            "never-opened": {"ends_at": now - 20},
            "before-join": {"starts_at": now - 200},
            "draft": {"published_at": None},
            "deleted": {"deleted": True},
            "practice": {"course_id": practice.id},
            "unscheduled": {"starts_at": None},
            "starts-at-join": {"starts_at": now - 100},
        }
        activities = {
            title: Activity(title=title, **{**defaults, **fields})
            for title, fields in cases.items()
        }
        db.add_all(activities.values())
        db.flush()
        activity_ids = {name: row.id for name, row in activities.items()}
    rows = notifications(client)
    assert {item["activity_name"] for item in rows.values()} == {"open", "ended", "starts-at-join"}
    assert all(item["course_name"] == "Ethics" and not item["pop_up"] for item in rows.values())
    mark(client, "activity:" + activity_ids["ended"])
    assert notifications(client)["activity:" + activity_ids["ended"]]["read"]
    with storage.transaction() as db:
        db.get(Activity, activity_ids["open"]).starts_at = now + 600
        db.get(Activity, activity_ids["ended"]).deleted = True
    assert [item["activity_name"] for item in notifications(client).values()] == ["starts-at-join"]
    with storage.transaction() as db:
        db.delete(db.scalar(select(Enrollment).where(Enrollment.course_id == course_id)))
    assert notifications(client) == {}
    switch(client, teacher)
    assert notifications(client) == {}


def test_read_is_idempotent_and_delete_clears_receipts(client):
    from app.modules.notifications.repositories import NotificationRead

    student = user(client, "student")
    admin = user(client, "fizzy", account_role="teacher")
    make_admin("fizzy")
    announcement = publish(client)
    hidden = publish(client, audience="teacher")
    key = "announcement:" + announcement["id"]
    switch(client, student)
    csrf = client.headers.pop("X-CSRF-Token")
    assert client.post(NOTIFICATIONS + "/read", json={"id": key}).status_code == 403
    client.headers["X-CSRF-Token"] = csrf
    for item in (key, key, "unknown", "announcement:" + hidden["id"], "guest_expiry"):
        mark(client, item)
    rows = notifications(client)
    assert rows[key]["read"] and not rows[key]["pop_up"]
    with storage.transaction() as db:
        assert [row.notification_id for row in db.scalars(select(NotificationRead))] == [key]
    switch(client, admin)
    assert client.delete(f"{ADMIN}/{announcement['id']}").status_code == 204
    switch(client, student)
    mark(client, key)
    assert notifications(client) == {}
    with storage.transaction() as db:
        assert db.scalars(select(NotificationRead)).all() == []


def test_guest_login_moves_receipts_and_deduplicates(client):
    from app.modules.notifications.repositories import NotificationRead

    student = user(client, "student")
    teacher, course = teacher_course(client)
    make_admin(teacher["username"])
    keys = ["announcement:" + publish(client, title=title)["id"] for title in ("A", "B")]
    switch(client, student)
    mark(client, keys[0])
    leave(client)
    response = guest_join(client, course["code"])
    client.headers["X-CSRF-Token"] = response.json()["account"]["csrf_token"]
    for key in keys:
        mark(client, key)
    assert switch(client, student)["guest_merge"] == "MERGED"
    assert all(item["read"] and not item["pop_up"] for item in notifications(client).values())
    with storage.transaction() as db:
        assert {
            (row.account_id, row.notification_id) for row in db.scalars(select(NotificationRead))
        } == {(student["id"], key) for key in keys}


def test_unverified_formal_account_cannot_read_notifications(client):
    student = user(client, "student")
    with storage.transaction() as db:
        db.get(Account, student["id"]).verified = False
    assert client.get(NOTIFICATIONS).status_code == 403
    assert client.post(NOTIFICATIONS + "/read", json={"id": "guest_expiry"}).status_code == 403
