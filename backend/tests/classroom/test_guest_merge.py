"""Logging in on a device that still holds a guest session moves the guest's records over."""

import os
import time

import pytest
from fastapi.testclient import TestClient

from app.classroom_app import create_app
from app.modules.identity_access import guests
from app.modules.identity_access.repositories import Account
from app.modules.identity_access.service import register_guest_hook
from app.modules.platform import storage
from app.modules.platform.env import env_str

os.environ["CLASSROOM_COOKIE_SECURE"] = "false"
os.environ["SOCRATES_ALLOWED_ORIGINS"] = "http://testserver"
PASSWORD = "Socratic-123456"
LOGIN = {"login": "ming", "password": PASSWORD}


class Records:
    """A module's records, as owner ids; reassign moves the guest's to the account."""

    def __init__(self, broken=False):
        self.moves = []
        self.broken = broken

    def reassign(self, db, guest_id, account_id):
        if self.broken:
            raise RuntimeError("cannot reassign")
        self.moves.append((guest_id, account_id))

    def forget_name(self, db, guest_id):
        raise AssertionError("not part of logging in")


@pytest.fixture
def client(monkeypatch):
    storage.configure(env_str("CLASSROOM_TEST_DATABASE_URL", "sqlite://"), create=True)
    storage.Base.metadata.drop_all(storage.engine())
    storage.Base.metadata.create_all(storage.engine())
    monkeypatch.setattr(guests, "GUEST_HOOKS", {})
    with TestClient(create_app(background=False)) as c:
        body = {"username": "ming", "email": "ming@example.org", "password": PASSWORD}
        c.account_id = c.post("/api/v2/auth/register", json=body).json()["id"]
        c.cookies.clear()
        yield c


def join(c):
    """A guest session on this device; returns the guest's id and its cookie."""
    guest = c.post("/api/v2/auth/guest", json={"nickname": "小明", "locale": "en"}).json()
    return guest["id"], c.cookies["socrates_session"]


def test_logging_in_moves_the_guest_records_and_ends_the_guest_session(client):
    records = Records()
    register_guest_hook("solo-activity", records)
    guest_id, guest_cookie = join(client)
    r = client.post("/api/v2/auth/login", json=LOGIN)
    assert r.status_code == 200, r.text
    assert r.json()["guest_merge"] == "MERGED"
    assert records.moves == [(guest_id, client.account_id)]
    assert client.get("/api/v2/auth/me").json()["id"] == client.account_id
    client.cookies.set("socrates_session", guest_cookie)
    assert client.get("/api/v2/auth/me").json()["detail"] == "LOGIN_REQUIRED"


def test_nothing_moves_without_a_live_guest_session(client):
    records = Records()
    register_guest_hook("solo-activity", records)
    assert client.post("/api/v2/auth/login", json=LOGIN).json()["guest_merge"] == "NONE"
    client.cookies.clear()
    guest_id, _ = join(client)
    with storage.transaction() as db:
        db.get(Account, guest_id).guest_expires_at = time.time() - 1
    assert client.post("/api/v2/auth/login", json=LOGIN).json()["guest_merge"] == "NONE"
    bad = client.post("/api/v2/auth/login", json={**LOGIN, "password": "Wrong-123456"})
    assert bad.status_code == 401
    assert records.moves == []


def test_a_failing_hook_rolls_the_merge_back_but_not_the_login(client):
    moved, broken = Records(), Records(broken=True)
    register_guest_hook("course-management", moved)
    register_guest_hook("solo-activity", broken)
    guest_id, guest_cookie = join(client)
    r = client.post("/api/v2/auth/login", json=LOGIN)
    assert r.status_code == 200 and r.json()["id"] == client.account_id
    assert r.json()["guest_merge"] == "NONE"
    # Rolled back with the hooks: the guest session was not ended either.
    client.cookies.set("socrates_session", guest_cookie)
    assert client.get("/api/v2/auth/me").json()["id"] == guest_id


def test_another_site_cannot_log_a_guest_device_in(client):
    records = Records()
    register_guest_hook("solo-activity", records)
    join(client)
    r = client.post("/api/v2/auth/login", json=LOGIN, headers={"Origin": "https://evil.example"})
    assert (r.status_code, r.json()["detail"]) == (403, "ORIGIN_BINDING_REQUIRED")
    assert records.moves == []
