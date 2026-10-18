"""Unverified accounts whose verification link expired release their username/email on register."""

import time

import pytest
from sqlalchemy import delete, select, text, update

from app.modules.classroom_core.api.classroom_schemas import Login, Register
from app.modules.classroom_core.orchestrator.classroom import DomainError
from app.modules.platform.repositories.classroom_storage import (
    Account,
    EmailToken,
    LoginSession,
    Script,
    configure,
    digest,
    transaction,
)
from app.modules.identity_access.services import classroom_auth as auth
from app.modules.identity_access.services.email_delivery import MailDelivery


@pytest.fixture(autouse=True)
def database(monkeypatch):
    monkeypatch.setenv("SOCRATES_ENVIRONMENT", "local-dev")
    monkeypatch.setenv("SOCRATES_MAIL_TRANSPORT", "fixture")
    monkeypatch.setenv("SOCRATES_PUBLIC_ORIGIN", "http://127.0.0.1:18980")
    configure("sqlite+pysqlite:///:memory:", create=True)


def register(username="arthur", email="arthur@example.test", password="correct-horse-battery"):
    return auth.register(Register(username=username, email=email, password=password))


def expire_verification(account_id):
    """Move the account's verification window into the past (link and registration time)."""
    past = time.time() - auth.VERIFY_TOKEN_SECONDS - 60
    with transaction() as db:
        db.execute(
            update(EmailToken).where(EmailToken.account_id == account_id).values(expires_at=past)
        )
        db.execute(update(Account).where(Account.id == account_id).values(created_at=past))


def code_of(call):
    with pytest.raises(DomainError) as caught:
        call()
    return caught.value.code, caught.value.status


def test_stale_unverified_account_releases_username_and_email():
    old_token, old = register()
    expire_verification(old["id"])

    _, new = register(password="another-horse-battery")

    assert new["id"] != old["id"]
    assert new["username"] == "arthur"
    assert new["email"] == "arthur@example.test"
    with transaction() as db:
        stale = db.get(Account, old["id"])
        assert stale is not None  # not deleted
        assert stale.username == f"released-{old['id']}"
        assert stale.email == f"{old['id']}@released.invalid"
        assert not stale.verified
        # The old session no longer authenticates; the old verification link is dead.
        with pytest.raises(DomainError) as caught:
            auth.identity(db, old_token, verified=False)
        assert caught.value.code == "LOGIN_REQUIRED"
        tokens = db.scalars(select(EmailToken).where(EmailToken.account_id == old["id"])).all()
        assert tokens and all(t.consumed for t in tokens)
    # Logging in by the old name reaches the new account only; the released row cannot log in.
    assert code_of(
        lambda: auth.login(Login(login=f"released-{old['id']}", password="correct-horse-battery"))
    ) == ("請確認登入資料。", 401)
    _, logged_in = auth.login(Login(login="arthur", password="another-horse-battery"))
    assert logged_in["id"] == new["id"]


def test_stale_account_without_any_token_uses_registration_age():
    _, old = register()
    with transaction() as db:
        db.execute(delete(EmailToken).where(EmailToken.account_id == old["id"]))
        db.execute(
            update(Account)
            .where(Account.id == old["id"])
            .values(created_at=time.time() - auth.VERIFY_TOKEN_SECONDS + 600)
        )
    assert code_of(lambda: register(email="other@example.test")) == (
        "ACCOUNT_PENDING_VERIFICATION",
        409,
    )
    with transaction() as db:
        db.execute(
            update(Account)
            .where(Account.id == old["id"])
            .values(created_at=time.time() - auth.VERIFY_TOKEN_SECONDS - 1)
        )
    _, new = register(email="other@example.test")
    assert new["username"] == "arthur"


def test_still_pending_account_keeps_its_name_and_email():
    _, old = register()
    assert code_of(lambda: register(email="someone-else@example.test")) == (
        "ACCOUNT_PENDING_VERIFICATION",
        409,
    )
    assert code_of(lambda: register(username="someone-else")) == (
        "ACCOUNT_PENDING_VERIFICATION",
        409,
    )
    # A resend restarts the window from the newest link, even if the first one had expired.
    expire_verification(old["id"])
    auth.request_email("arthur@example.test", "verify", expected_account_id=old["id"])
    assert code_of(lambda: register(email="someone-else@example.test"))[0] == (
        "ACCOUNT_PENDING_VERIFICATION"
    )
    with transaction() as db:
        assert db.get(Account, old["id"]).username == "arthur"


def test_verified_accounts_are_never_released():
    _, old = register()
    with transaction() as db:
        db.execute(update(Account).where(Account.id == old["id"]).values(verified=True))
    expire_verification(old["id"])
    assert code_of(lambda: register(email="someone-else@example.test")) == ("USERNAME_TAKEN", 409)
    assert code_of(lambda: register(username="someone-else")) == ("EMAIL_TAKEN", 409)
    # Username is checked first when both collide.
    assert code_of(lambda: register()) == ("USERNAME_TAKEN", 409)
    with transaction() as db:
        assert db.get(Account, old["id"]).username == "arthur"


def test_release_keeps_rows_that_reference_the_account():
    old_token, old = register()
    with transaction() as db:
        db.add(Script(id="script-1", owner_id=old["id"], document={"title": "t"}))
    expire_verification(old["id"])

    register(email="fresh@example.test")

    with transaction() as db:
        assert db.get(Account, old["id"]) is not None
        assert db.get(Script, "script-1").owner_id == old["id"]
        session = db.get(LoginSession, digest(old_token))
        assert session is not None and session.account_id == old["id"]
        assert session.expires_at <= time.time()
        assert db.scalars(select(EmailToken).where(EmailToken.account_id == old["id"])).all()
        assert db.scalars(select(MailDelivery).where(MailDelivery.account_id == old["id"])).all()
        db.execute(text("PRAGMA foreign_keys=ON"))
        assert db.execute(text("PRAGMA foreign_key_check")).all() == []
        assert db.scalar(select(Account).where(Account.username == "arthur")).id != old["id"]
