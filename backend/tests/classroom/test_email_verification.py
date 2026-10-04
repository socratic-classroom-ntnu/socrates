import base64
import hashlib
import hmac
import json
import time
from urllib.parse import parse_qs, urlparse

import pytest
from sqlalchemy import func, select

from app.run2 import auth
from app.run2.contracts import Register
from app.run2.email_delivery import (
    MailDelivery,
    apply_resend_webhook,
    send_mail_once,
)
from app.run2.orchestrator import DomainError
from app.run2.storage import (
    Account,
    EmailToken,
    LoginSession,
    Mail,
    configure,
    transaction,
)


@pytest.fixture(autouse=True)
def database(monkeypatch):
    monkeypatch.setenv("SOCRATES_ENVIRONMENT", "local-dev")
    monkeypatch.setenv("SOCRATES_MAIL_TRANSPORT", "fixture")
    monkeypatch.setenv(
        "SOCRATES_PUBLIC_ORIGIN",
        "http://127.0.0.1:18980",
    )
    configure("sqlite+pysqlite:///:memory:", create=True)


def register():
    return auth.register(
        Register(
            username="arthur",
            email="arthur@example.test",
            password="correct-horse-battery",
        )
    )


def latest_preview() -> str:
    with transaction() as db:
        row = db.scalar(
            select(MailDelivery)
            .where(MailDelivery.purpose == "verify")
            .order_by(MailDelivery.created_at.desc())
        )
        return row.preview_url


def test_registration_creates_restricted_session_and_one_mail():
    token, account = register()
    assert account["verified"] is False
    assert account["authority_state"] == "EMAIL_VERIFICATION"
    assert account["csrf_token"]
    with transaction() as db:
        assert db.scalar(select(func.count(Account.id))) == 1
        assert db.scalar(select(func.count(LoginSession.token_hash))) == 1
        assert db.scalar(select(func.count(Mail.id))) == 1
        assert db.scalar(select(func.count(MailDelivery.mail_id))) == 1
        current, _ = auth.identity(
            db,
            token,
            verified=False,
        )
        assert current.email == "arthur@example.test"
        with pytest.raises(DomainError):
            auth.identity(db, token, verified=True)


def test_fixture_delivery_and_verification_unlock_product():
    token, _ = register()
    assert send_mail_once() is True
    with transaction() as db:
        delivery = db.scalar(select(MailDelivery))
        mail = db.scalar(select(Mail))
        assert delivery.provider == "fixture"
        assert delivery.provider_message_id.startswith("fixture-")
        assert delivery.provider_status == "ACCEPTED"
        assert mail.state == "SENT"

    query = parse_qs(urlparse(latest_preview()).query)
    result = auth.use_token(query["verify_token"][0], "verify")
    assert result["status"] == "VERIFIED"

    with transaction() as db:
        account, _ = auth.identity(db, token, verified=True)
        assert account.verified is True


def test_resend_rotates_to_one_active_token():
    register()
    first = latest_preview()
    result = auth.request_email(
        "arthur@example.test",
        "verify",
    )
    assert result["status"] == "REQUEST_RECORDED"
    second = latest_preview()
    assert first != second

    with transaction() as db:
        active = db.scalar(
            select(func.count(EmailToken.token_hash)).where(
                EmailToken.purpose == "verify",
                EmailToken.consumed.is_(False),
            )
        )
        assert active == 1


def test_delivery_status_returns_local_preview_only_in_fixture():
    _, account = register()
    value = auth.verification_status(account["id"])
    assert value["verified"] is False
    assert value["delivery"]["preview_url"].startswith("http://127.0.0.1:18980/")


def test_resend_webhook_updates_durable_receipt(monkeypatch):
    register()
    send_mail_once()
    secret_bytes = b"r104-webhook-secret"
    secret = base64.b64encode(secret_bytes).decode()
    monkeypatch.setenv("RESEND_WEBHOOK_SECRET", "whsec_" + secret)

    with transaction() as db:
        delivery = db.scalar(select(MailDelivery))
        provider_message_id = delivery.provider_message_id

    body = json.dumps(
        {
            "type": "email.delivered",
            "data": {"email_id": provider_message_id},
        },
        separators=(",", ":"),
    ).encode()
    timestamp = str(int(time.time()))
    event_id = "msg_r104"
    signed = f"{event_id}.{timestamp}.".encode() + body
    signature = base64.b64encode(hmac.new(secret_bytes, signed, hashlib.sha256).digest()).decode()

    result = apply_resend_webhook(
        body,
        {
            "svix-id": event_id,
            "svix-timestamp": timestamp,
            "svix-signature": "v1," + signature,
        },
    )
    assert result["matched"] is True
    assert result["provider_status"] == "DELIVERED"

    with transaction() as db:
        delivery = db.scalar(select(MailDelivery))
        assert delivery.provider_status == "DELIVERED"
        assert delivery.delivered_at is not None
