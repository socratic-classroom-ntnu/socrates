"""後台：平台管理員與功能開關（spec P1–P5、P6、P7、P9、P11、P15、P16、P18、P23、P25）。"""

import time

from sqlalchemy import select

from app.modules.admin import service as admin_service
from app.modules.identity_access import service as identity
from app.modules.identity_access.repositories import Account
from app.modules.platform import storage as storage
from app.modules.platform import toggles
from tests.course_management.conftest import PASSWORD, switch, user
from tests.course_management.test_guest_join import guest_join, leave, teacher_course


def make_admin(username: str) -> None:
    with storage.transaction() as db:
        account = db.scalar(select(Account).where(Account.username == username))
        account.platform_role = "admin"


def account_id(username: str) -> str:
    with storage.transaction() as db:
        return db.scalar(select(Account.id).where(Account.username == username))


def admins() -> set[str]:
    with storage.transaction() as db:
        return set(db.scalars(select(Account.username).where(Account.platform_role == "admin")))


# ---- 誰是管理員 ----------------------------------------------------------------------------


def test_me_says_whether_the_account_is_an_admin(client):
    user(client, "fizzy", account_role="teacher")
    assert client.get("/api/v2/auth/me").json()["is_admin"] is False
    make_admin("fizzy")
    assert client.get("/api/v2/auth/me").json()["is_admin"] is True


def test_non_admins_see_nothing(client):
    paths = ("/api/v2/admin/toggles", "/api/v2/admin/admins")
    for path in paths:
        response = client.get(path)
        assert (response.status_code, response.json()["detail"]) == (404, "ADMIN_NOT_FOUND")
    user(client, "mei")
    for path in paths:
        assert client.get(path).json()["detail"] == "ADMIN_NOT_FOUND"
    _, course = teacher_course(client)
    leave(client)
    guest_join(client, course["code"])
    for path in paths:
        assert client.get(path).status_code == 404


def test_invalid_requests_from_non_admins_still_get_not_found(client):
    for method, path, body in (
        ("POST", "/api/v2/admin/admins", None),
        ("PUT", "/api/v2/admin/toggles/group_mode", None),
        ("POST", "/api/v2/admin/admins", {"username": 1, "extra": True}),
    ):
        response = client.request(method, path, json=body)
        assert (response.status_code, response.json()["detail"]) == (404, "ADMIN_NOT_FOUND"), path
    response = client.get("/api/v2/feedback?page=0")
    assert (response.status_code, response.json()["detail"]) == (404, "FEEDBACK_NOT_FOUND")
    user(client, "mei")
    response = client.post("/api/v2/admin/admins")
    assert (response.status_code, response.json()["detail"]) == (404, "ADMIN_NOT_FOUND")


# ---- 新增管理員（P4、P18）------------------------------------------------------------------


def test_an_admin_adds_another_by_username(client):
    user(client, "mei", account_role="student")
    user(client, "fizzy", account_role="teacher")
    make_admin("fizzy")
    response = client.post("/api/v2/admin/admins", json={"username": " MEI "})
    assert response.status_code == 201, response.text
    assert response.json()["username"] == "mei"
    assert admins() == {"fizzy", "mei"}
    listed = client.get("/api/v2/admin/admins").json()
    assert {row["username"]: row["is_you"] for row in listed} == {"fizzy": True, "mei": False}
    assert {row["username"]: row["account_role"] for row in listed}["mei"] == "student"


def test_adding_an_admin_explains_why_it_failed(client):
    _, course = teacher_course(client)
    leave(client)
    guest = guest_join(client, course["code"]).json()["account"]
    leave(client)
    client.post(
        "/api/v2/auth/register",
        json={
            "username": "newbie",
            "email": "newbie@example.org",
            "password": PASSWORD,
            "account_role": "student",
        },
    )
    user(client, "fizzy", account_role="teacher")
    make_admin("fizzy")
    cases = {
        "nobody": (404, "ADMIN_ACCOUNT_NOT_FOUND"),
        guest["username"]: (422, "ADMIN_GUEST_NOT_ALLOWED"),
        "newbie": (422, "ADMIN_UNVERIFIED"),
        "fizzy": (409, "ADMIN_ALREADY"),
    }
    for name, expected in cases.items():
        response = client.post("/api/v2/admin/admins", json={"username": name})
        assert (response.status_code, response.json()["detail"]) == expected, name
    assert admins() == {"fizzy"}


def test_writes_need_the_csrf_token(client):
    user(client, "mei")
    user(client, "fizzy", account_role="teacher")
    make_admin("fizzy")
    client.headers["X-CSRF-Token"] = "wrong"
    response = client.post("/api/v2/admin/admins", json={"username": "mei"})
    assert (response.status_code, response.json()["detail"]) == (403, "SESSION_CSRF_REQUIRED")


# ---- 移除管理員（P5、P23）------------------------------------------------------------------


def test_an_admin_removes_another_but_not_themself(client):
    mei = user(client, "mei")
    fizzy = user(client, "fizzy", account_role="teacher")
    make_admin("fizzy")
    make_admin("mei")
    own = client.delete(f"/api/v2/admin/admins/{fizzy['id']}")
    assert (own.status_code, own.json()["detail"]) == (409, "ADMIN_CANNOT_REMOVE_SELF")
    assert client.delete(f"/api/v2/admin/admins/{mei['id']}").status_code == 204
    assert admins() == {"fizzy"}
    again = client.delete(f"/api/v2/admin/admins/{mei['id']}")
    assert (again.status_code, again.json()["detail"]) == (404, "ADMIN_ACCOUNT_NOT_FOUND")


def test_an_admin_removed_meanwhile_cannot_remove_the_other(client):
    """Two admins removing each other: whoever comes second is no longer an admin (P23)."""
    mei = user(client, "mei")
    fizzy = user(client, "fizzy", account_role="teacher")
    make_admin("fizzy")
    make_admin("mei")
    with storage.transaction() as db:
        db.scalar(select(Account).where(Account.username == "fizzy")).platform_role = None
    response = client.delete(f"/api/v2/admin/admins/{mei['id']}")
    assert (response.status_code, response.json()["detail"]) == (404, "ADMIN_NOT_FOUND")
    assert admins() == {"mei"}
    assert fizzy["id"]


# ---- 第一批管理員（P3）--------------------------------------------------------------------


def test_bootstrap_applies_only_while_nobody_is_an_admin(client, monkeypatch):
    user(client, "fizzy", account_role="teacher")
    user(client, "mei")
    client.post(
        "/api/v2/auth/register",
        json={
            "username": "newbie",
            "email": "newbie@example.org",
            "password": PASSWORD,
            "account_role": "student",
        },
    )
    monkeypatch.setenv("SOCRATES_BOOTSTRAP_ADMINS", " Fizzy , ,newbie,nobody")
    with storage.transaction() as db:
        assert admin_service.bootstrap_from_env(db) == 1
    assert admins() == {"fizzy"}
    monkeypatch.setenv("SOCRATES_BOOTSTRAP_ADMINS", "mei")
    with storage.transaction() as db:
        assert admin_service.bootstrap_from_env(db) == 0
    assert admins() == {"fizzy"}


def test_bootstrap_does_nothing_without_the_variable(client, monkeypatch):
    user(client, "fizzy")
    monkeypatch.delenv("SOCRATES_BOOTSTRAP_ADMINS", raising=False)
    with storage.transaction() as db:
        assert admin_service.bootstrap_from_env(db) == 0
    assert admins() == set()


# ---- 功能開關（P6、P7、P9、P25）------------------------------------------------------------


def test_group_mode_is_off_until_an_admin_turns_it_on(client):
    with storage.transaction() as db:
        assert toggles.toggle_enabled(db, "group_mode") is False
    assert client.get("/api/v2/public-config").json()["features"] == {"group_mode": False}
    user(client, "fizzy", account_role="teacher")
    make_admin("fizzy")
    [row] = client.get("/api/v2/admin/toggles").json()
    assert row == {
        "key": "group_mode",
        "name": "多人模式",
        "description": row["description"],
        "enabled": False,
        "updated_at": None,
        "updated_by_name": None,
    }
    before = time.time()
    response = client.put("/api/v2/admin/toggles/group_mode", json={"enabled": True})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["enabled"] is True and body["updated_by_name"] == "fizzy"
    assert body["updated_at"] >= before
    assert client.get("/api/v2/public-config").json()["features"] == {"group_mode": True}
    with storage.transaction() as db:
        assert toggles.toggle_enabled(db, "group_mode") is True


def test_an_unknown_toggle_is_refused(client):
    user(client, "fizzy", account_role="teacher")
    make_admin("fizzy")
    response = client.put("/api/v2/admin/toggles/voice_mode", json={"enabled": True})
    assert (response.status_code, response.json()["detail"]) == (404, "ADMIN_TOGGLE_NOT_FOUND")


def test_a_switched_account_sees_its_own_admin_state(client):
    mei = user(client, "mei")
    fizzy = user(client, "fizzy", account_role="teacher")
    make_admin("fizzy")
    switch(client, mei)
    assert client.get("/api/v2/auth/me").json()["is_admin"] is False
    switch(client, fizzy)
    assert client.get("/api/v2/auth/me").json()["is_admin"] is True
    assert identity  # public surface used by other modules
    assert account_id("mei") == mei["id"]


def test_starting_the_app_applies_the_first_admins(client, monkeypatch):
    """The startup really calls the bootstrap, not only the function on its own (spec P3), and
    before it adds the built-in admin: otherwise the variable would never find an empty list."""
    import asyncio

    from app import classroom_app
    from app.modules.app_shell import llm_workers

    async def idle():
        return None

    for name in ("clock_loop", "mail_loop", "guest_expiry_loop", "feedback_purge_loop", "llm_loop"):
        monkeypatch.setattr(classroom_app, name, idle, raising=False)
        monkeypatch.setattr(llm_workers, name, idle, raising=False)
    monkeypatch.setattr(classroom_app.BUS, "listen", idle)
    monkeypatch.setattr(classroom_app.BUS, "sweep", idle)
    user(client, "fizzy", account_role="teacher")
    monkeypatch.setenv("SOCRATES_BOOTSTRAP_ADMINS", "fizzy")

    async def start_and_stop():
        async with classroom_app.lifespan(client.app):
            pass

    asyncio.run(start_and_stop())
    assert admins() == {"fizzy", "socrates-admin"}
