"""Joining without registering: guest accounts, their sessions, and registering in place."""

import os
import re
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.classroom_app import create_app
from app.modules.identity_access.auth import GUEST_SECONDS
from app.modules.identity_access.repositories import Account, LoginSession, Mail
from app.modules.platform import storage
from app.modules.platform.env import env_str

os.environ["CLASSROOM_COOKIE_SECURE"] = "false"
os.environ["SOCRATES_ALLOWED_ORIGINS"] = "http://testserver"
PASSWORD = "Socratic-123456"


@pytest.fixture
def client():
    storage.configure(env_str("CLASSROOM_TEST_DATABASE_URL", "sqlite://"), create=True)
    storage.Base.metadata.drop_all(storage.engine())
    storage.Base.metadata.create_all(storage.engine())
    with TestClient(create_app(background=False)) as c:
        yield c


def join(c, nickname="小明"):
    r = c.post("/api/v2/auth/guest", json={"nickname": nickname, "locale": "en"})
    assert r.status_code == 200, r.text
    c.headers["X-CSRF-Token"] = r.json()["csrf_token"]
    return r


def set_expiry(account_id, at):
    """Idle until at: the account and its session expire together, as they do for real."""
    with storage.transaction() as db:
        db.get(Account, account_id).guest_expires_at = at
        for session in db.scalars(
            select(LoginSession).where(LoginSession.account_id == account_id)
        ):
            session.expires_at = at


def test_a_guest_needs_only_a_nickname_and_a_language(client):
    r = join(client)
    view = r.json()
    assert view["kind"] == "guest" and view["email"] == "" and view["locale"] == "en"
    assert view["username"].startswith("小明-")
    assert view["guest_expires_at"] == pytest.approx(time.time() + GUEST_SECONDS, abs=60)
    assert "max-age=34560000" in r.headers["set-cookie"].lower()
    assert client.get("/api/v2/auth/me").json()["id"] == view["id"]


def test_two_guests_may_pick_the_same_nickname(client):
    first = join(client).json()["username"]
    client.cookies.clear()
    assert join(client).json()["username"] != first


def test_guests_are_rejected_unless_the_endpoint_opts_in(client):
    join(client)
    for method, path in (
        ("get", "/api/v2/classrooms"),
        ("post", "/api/v2/auth/verification-email"),
    ):
        r = getattr(client, method)(
            path, **({"json": {"email": "x@example.org"}} if method == "post" else {})
        )
        assert (r.status_code, r.json()["detail"]) == (403, "GUEST_NOT_ALLOWED"), path


def test_every_action_pushes_the_expiry_back(client):
    guest = join(client).json()
    set_expiry(guest["id"], time.time() + 10)
    after = client.get("/api/v2/auth/me").json()["guest_expires_at"]
    assert after == pytest.approx(time.time() + GUEST_SECONDS, abs=60)


def test_an_idle_guest_has_expired(client):
    guest = join(client).json()
    set_expiry(guest["id"], time.time() - 1)
    r = client.get("/api/v2/auth/me")
    assert (r.status_code, r.json()["detail"]) == (401, "GUEST_EXPIRED")


def test_registering_keeps_the_account_id(client):
    guest = join(client).json()
    r = client.post(
        "/api/v2/auth/guest/upgrade", json={"email": "Ming@Example.org", "password": PASSWORD}
    )
    assert r.status_code == 200, r.text
    view = r.json()
    assert view["id"] == guest["id"] and view["kind"] == "registered"
    assert view["email"] == "ming@example.org" and view["guest_expires_at"] is None
    assert view["verification_delivery"] is not None
    again = client.post(
        "/api/v2/auth/guest/upgrade", json={"email": "other@example.org", "password": PASSWORD}
    )
    assert (again.status_code, again.json()["detail"]) == (409, "GUEST_ONLY")
    client.cookies.clear()
    login = client.post(
        "/api/v2/auth/login", json={"login": "ming@example.org", "password": PASSWORD}
    )
    assert login.json()["id"] == guest["id"]


def test_registering_cannot_take_a_verified_email(client):
    body = {"username": "teacher", "email": "teacher@example.org", "password": PASSWORD}
    assert client.post("/api/v2/auth/register", json=body).status_code == 200
    with storage.transaction() as db:
        token = re.search(r"verify_token=(\S+)", db.scalars(select(Mail)).all()[-1].body)[1]
    assert client.post("/api/v2/auth/verify", json={"token": token}).status_code == 200
    client.cookies.clear()
    join(client)
    r = client.post(
        "/api/v2/auth/guest/upgrade", json={"email": "teacher@example.org", "password": PASSWORD}
    )
    assert (r.status_code, r.json()["detail"]) == (409, "EMAIL_TAKEN")


def test_a_guest_cannot_log_in_with_a_password(client):
    username = join(client).json()["username"]
    client.cookies.clear()
    r = client.post("/api/v2/auth/login", json={"login": username, "password": PASSWORD})
    assert (r.status_code, r.json()["detail"]) == (401, "AUTH_INVALID_CREDENTIALS")


@pytest.mark.parametrize(
    "body",
    [
        {"nickname": "", "locale": "en"},
        {"nickname": "x" * 25, "locale": "en"},
        {"nickname": "小明", "locale": "fr"},
        {"nickname": "小明"},
        {"nickname": "小明", "locale": "en", "course_code": "ABCD1234"},
    ],
    ids=["empty-nickname", "long-nickname", "unknown-locale", "no-locale", "extra-field"],
)
def test_joining_validates_the_request(client, body):
    assert client.post("/api/v2/auth/guest", json=body).status_code == 422


@pytest.mark.parametrize(
    "body",
    [
        {"email": "not-an-email", "password": PASSWORD},
        {"email": "ming@example.org", "password": "weakpassword"},
        {"email": "ming@example.org"},
    ],
    ids=["bad-email", "weak-password", "no-password"],
)
def test_registering_validates_the_request(client, body):
    join(client)
    assert client.post("/api/v2/auth/guest/upgrade", json=body).status_code == 422


def test_registering_needs_a_session(client):
    r = client.post(
        "/api/v2/auth/guest/upgrade", json={"email": "a@example.org", "password": PASSWORD}
    )
    assert (r.status_code, r.json()["detail"]) == (401, "LOGIN_REQUIRED")
