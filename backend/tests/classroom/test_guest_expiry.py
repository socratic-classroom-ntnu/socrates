"""Deleting idle guests: each module's records through its hook, then the account."""

import time

import pytest

from app.modules.identity_access import guests
from app.modules.identity_access.auth import GUEST_SECONDS
from app.modules.identity_access.repositories import Account, LoginSession
from app.modules.identity_access.service import delete_expired_guests, register_guest_hook
from app.modules.platform import storage
from app.modules.platform.env import env_str
from app.modules.platform.storage import digest


@pytest.fixture(autouse=True)
def database(monkeypatch):
    storage.configure(env_str("CLASSROOM_TEST_DATABASE_URL", "sqlite://"), create=True)
    storage.Base.metadata.drop_all(storage.engine())
    storage.Base.metadata.create_all(storage.engine())
    monkeypatch.setattr(guests, "GUEST_HOOKS", {})


class Records:
    """A module's guest records, as a set of owner ids."""

    def __init__(self, *owners, broken=False):
        self.owners = set(owners)
        self.broken = broken

    def reassign(self, db, guest_id, account_id):
        raise AssertionError("not part of the expiry job")

    def delete(self, db, guest_id):
        if self.broken:
            raise RuntimeError("cannot delete")
        self.owners.discard(guest_id)


def account(name, kind="guest", idle_days=8.0):
    with storage.transaction() as db:
        row = Account(
            username=name,
            kind=kind,
            guest_expires_at=time.time() + GUEST_SECONDS - idle_days * 86400
            if kind == "guest"
            else None,
        )
        db.add(row)
        db.flush()
        db.add(
            LoginSession(token_hash=digest(name), account_id=row.id, csrf_token="c", expires_at=0)
        )
        return row.id


def exists(account_id):
    with storage.transaction() as db:
        return db.get(Account, account_id) is not None


def test_a_guest_idle_on_day_8_is_deleted_with_its_records():
    idle, active = account("idle"), account("active", idle_days=6)
    registered = account("registered", kind="registered")
    solo, enrollments = Records(idle, active), Records(idle)
    register_guest_hook("solo-activity", solo)
    register_guest_hook("course-management", enrollments)
    assert delete_expired_guests() == [idle]
    assert not exists(idle) and exists(active) and exists(registered)
    assert solo.owners == {active} and enrollments.owners == set()


def test_a_failing_hook_keeps_that_guest_for_the_next_run():
    first, second = account("first"), account("second")
    register_guest_hook("solo-activity", Records(first, second, broken=True))
    assert delete_expired_guests() == []
    assert exists(first) and exists(second)
