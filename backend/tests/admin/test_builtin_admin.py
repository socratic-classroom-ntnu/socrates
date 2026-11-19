"""內建管理員 socrates-admin：每個環境啟動時都有同一個管理員帳號，不必請叢集設環境變數。

Only the argon2id hash lives in the (public) repo; the password stays with whoever generated it.
The account is created only while no account has that username, and an existing one is never
touched: a squatter who registered the name first does not become an admin, and an admin who was
removed in the 後台 is not added back on the next start.
"""

import argon2
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.admin import service as admin_service
from app.modules.identity_access.auth import HASHER
from app.modules.identity_access.repositories import Account
from app.modules.platform import storage as storage
from tests.admin.test_admin_api import admins
from tests.course_management.conftest import PASSWORD, user

BUILTIN = "socrates-admin"
TEST_PASSWORD = "Builtin-admin-test-1"


@pytest.fixture
def test_hash(monkeypatch):
    """Tests sign in with a password of their own; the committed hash belongs to the real one."""
    monkeypatch.setattr(admin_service, "BUILTIN_ADMIN_PASSWORD_HASH", HASHER.hash(TEST_PASSWORD))


def builtin_row() -> Account | None:
    with storage.transaction() as db:
        row = db.scalar(select(Account).where(Account.username == BUILTIN))
        if row is not None:
            db.expunge(row)
        return row


def ensure() -> bool:
    with storage.transaction() as db:
        return admin_service.ensure_builtin_admin(db)


def test_the_committed_hash_is_one_the_login_can_check():
    """A typo in the constant would lock everyone out of every environment at once."""
    assert admin_service.BUILTIN_ADMIN_USERNAME == BUILTIN
    params = argon2.extract_parameters(admin_service.BUILTIN_ADMIN_PASSWORD_HASH)
    assert params.type is argon2.Type.ID
    assert not HASHER.check_needs_rehash(admin_service.BUILTIN_ADMIN_PASSWORD_HASH)


def test_a_fresh_database_gets_the_builtin_admin(client, test_hash):
    assert ensure() is True
    row = builtin_row()
    assert row is not None
    assert row.kind == "registered"
    assert row.verified is True
    assert row.account_role == "teacher"
    assert row.platform_role == "admin"
    assert row.email is None
    assert admins() == {BUILTIN}


def test_the_builtin_admin_signs_in_and_sees_the_back_office(client, test_hash):
    ensure()
    response = client.post("/api/v2/auth/login", json={"login": BUILTIN, "password": TEST_PASSWORD})
    assert response.status_code == 200
    assert client.get("/api/v2/auth/me").json()["is_admin"] is True


def test_starting_again_changes_nothing(client, test_hash):
    ensure()
    first = builtin_row()
    assert ensure() is False
    again = builtin_row()
    assert again is not None and first is not None
    assert again.id == first.id
    assert again.password_hash == first.password_hash


def test_someone_who_registered_the_name_first_does_not_become_an_admin(client, test_hash):
    user(client, BUILTIN, account_role="teacher")
    assert ensure() is False
    row = builtin_row()
    assert row is not None
    assert row.platform_role is None
    assert HASHER.verify(row.password_hash, PASSWORD)
    assert admins() == set()


def test_a_worker_that_loses_the_race_leaves_the_winner_alone(client, test_hash):
    """Two workers start at once: both find the name free, the second insert hits the unique name.
    The loser must neither crash the startup nor promote the row it collided with."""
    from app.modules.identity_access import admins as admin_rows

    user(client, BUILTIN, account_role="teacher")  # the row the other worker (or a squatter) wrote
    real_scalar = Session.scalar
    looked_up = []

    def name_looks_free(self, statement, *args, **kwargs):
        if not looked_up:
            looked_up.append(statement)
            return None
        return real_scalar(self, statement, *args, **kwargs)

    with storage.transaction() as db:
        with pytest.MonkeyPatch.context() as patch:
            patch.setattr(Session, "scalar", name_looks_free)
            assert admin_rows.ensure_builtin_admin(db, BUILTIN, HASHER.hash(TEST_PASSWORD)) is False
        assert looked_up, "the name lookup was not the first query"
        # The savepoint rolled back on its own: the same transaction keeps working.
        assert db.scalar(select(Account.platform_role).where(Account.username == BUILTIN)) is None
    row = builtin_row()
    assert row is not None
    assert row.platform_role is None
    assert HASHER.verify(row.password_hash, PASSWORD)


def test_a_removed_builtin_admin_is_not_added_back(client, test_hash):
    ensure()
    with storage.transaction() as db:
        db.scalar(select(Account).where(Account.username == BUILTIN)).platform_role = None
    assert ensure() is False
    assert admins() == set()
