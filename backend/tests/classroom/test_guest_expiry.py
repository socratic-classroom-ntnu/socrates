"""Expiring guests: each module forgets the name, the account stays as an expired_guest."""

import time

import pytest
from sqlalchemy import select

from app.modules.identity_access import guests
from app.modules.identity_access.auth import GUEST_SECONDS
from app.modules.identity_access.repositories import Account, LoginSession
from app.modules.identity_access.service import expire_guests, register_guest_hook
from app.modules.platform import storage
from app.modules.platform.env import env_str
from app.modules.platform.storage import digest


@pytest.fixture(autouse=True)
def database(monkeypatch):
    storage.configure(env_str("CLASSROOM_TEST_DATABASE_URL", "sqlite://"), create=True)
    storage.Base.metadata.drop_all(storage.engine())
    storage.Base.metadata.create_all(storage.engine())
    monkeypatch.setattr(guests, "GUEST_HOOKS", {})


class Names:
    """A module's stored guest names, by owner id."""

    def __init__(self, *owners, broken=False):
        self.names = {owner: "小明" for owner in owners}
        self.broken = broken

    def reassign(self, db, guest_id, account_id):
        raise AssertionError("not part of the expiry job")

    def forget_name(self, db, guest_id):
        if self.broken:
            raise RuntimeError("cannot forget")
        self.names[guest_id] = None


def account(name, kind="guest", hours_since_join=169.0):
    with storage.transaction() as db:
        row = Account(
            username=name,
            kind=kind,
            guest_expires_at=time.time() + GUEST_SECONDS - hours_since_join * 3600
            if kind == "guest"
            else None,
        )
        db.add(row)
        db.flush()
        db.add(
            LoginSession(token_hash=digest(name), account_id=row.id, csrf_token="c", expires_at=2e9)
        )
        return row.id


def state(account_id):
    with storage.transaction() as db:
        row = db.get(Account, account_id)
        sessions = db.scalars(select(LoginSession).where(LoginSession.account_id == account_id))
        return row.kind, row.username, len(sessions.all())


def test_a_guest_past_168_hours_expires_and_keeps_its_records():
    due, active = account("due"), account("active", hours_since_join=72)
    unverified = account("unverified", kind="registered")
    solo, enrollments = Names(due, active), Names(due)
    register_guest_hook("solo-activity", solo)
    register_guest_hook("course-management", enrollments)
    assert expire_guests() == [due]
    assert state(due) == ("expired_guest", f"expired-guest-{due}", 0)
    assert state(active) == ("guest", "active", 1)
    assert state(unverified) == ("registered", "unverified", 1)
    assert solo.names == {due: None, active: "小明"} and enrollments.names == {due: None}
    assert expire_guests() == []


def test_a_failing_hook_keeps_that_guest_for_the_next_run():
    first, second = account("first"), account("second")
    register_guest_hook("solo-activity", Names(first, second, broken=True))
    assert expire_guests() == []
    assert state(first) == ("guest", "first", 1) and state(second) == ("guest", "second", 1)
