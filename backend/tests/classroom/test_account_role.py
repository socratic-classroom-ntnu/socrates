"""The account role: chosen once at registration, returned with every account view."""

import os
import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.classroom_app import create_app
from app.modules.identity_access.repositories import Mail
from app.modules.platform import storage
from app.modules.platform.env import env_str

os.environ["CLASSROOM_COOKIE_SECURE"] = "false"
os.environ["SOCRATES_ALLOWED_ORIGINS"] = "http://testserver"
PASSWORD = "Socratic-123456"
BODY = {"username": "ming", "email": "ming@example.org", "password": PASSWORD}


@pytest.fixture
def client():
    storage.configure(env_str("CLASSROOM_TEST_DATABASE_URL", "sqlite://"), create=True)
    storage.Base.metadata.drop_all(storage.engine())
    storage.Base.metadata.create_all(storage.engine())
    with TestClient(create_app(background=False)) as c:
        yield c


def register(c, **extra):
    r = c.post("/api/v2/auth/register", json={**BODY, **extra})
    if r.status_code == 200:
        c.headers["X-CSRF-Token"] = r.json()["csrf_token"]
    return r


def verify_and_log_in(c):
    with storage.transaction() as db:
        token = re.search(r"verify_token=(\S+)", db.scalars(select(Mail)).all()[-1].body)
    assert token is not None
    assert c.post("/api/v2/auth/verify", json={"token": token[1]}).status_code == 200
    r = c.post("/api/v2/auth/login", json={"login": BODY["username"], "password": PASSWORD})
    assert r.status_code == 200, r.text
    c.headers["X-CSRF-Token"] = r.json()["csrf_token"]
    return r


@pytest.mark.parametrize("role", ["teacher", "student"])
def test_registering_keeps_the_chosen_role(client, role):
    r = register(client, account_role=role)
    assert r.status_code == 200, r.text
    assert r.json()["account_role"] == role
    assert client.get("/api/v2/auth/me").json()["account_role"] == role


@pytest.mark.parametrize("extra", [{}, {"account_role": None}])
def test_registering_without_a_role_makes_a_student(client, extra):
    r = register(client, **extra)
    assert r.status_code == 200, r.text
    assert r.json()["account_role"] == "student"


@pytest.mark.parametrize("role", ["admin", "Teacher", ""])
def test_registering_rejects_any_other_role(client, role):
    r = register(client, account_role=role)
    assert r.status_code == 422
    assert r.json()["detail"][0]["loc"][-1] == "account_role"


def test_logging_in_and_changing_the_language_return_the_role(client):
    register(client, account_role="teacher")
    assert verify_and_log_in(client).json()["account_role"] == "teacher"
    r = client.put("/api/v2/account/locale", json={"locale": "en"})
    assert r.status_code == 200, r.text
    assert r.json()["account_role"] == "teacher"


def test_a_guest_is_a_student_and_stays_one_after_registering(client):
    r = client.post("/api/v2/auth/guest", json={"nickname": "小明", "locale": "en"})
    assert r.json()["account_role"] == "student"
    client.headers["X-CSRF-Token"] = r.json()["csrf_token"]
    upgraded = client.post("/api/v2/auth/guest/upgrade", json=BODY)
    assert upgraded.status_code == 200, upgraded.text
    assert upgraded.json()["account_role"] == "student"


def test_a_guest_cannot_choose_a_role_when_registering(client):
    r = client.post("/api/v2/auth/guest", json={"nickname": "小明", "locale": "en"})
    client.headers["X-CSRF-Token"] = r.json()["csrf_token"]
    r = client.post("/api/v2/auth/guest/upgrade", json={**BODY, "account_role": "teacher"})
    assert r.status_code == 422
    assert client.get("/api/v2/auth/me").json()["account_role"] == "student"
