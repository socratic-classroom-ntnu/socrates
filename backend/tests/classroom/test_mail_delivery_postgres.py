"""Exercise mail claims with PostgreSQL row locks, which SQLite omits."""

import os
import time
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from app.repositories import classroom_storage as storage
from app.services.email_delivery import MailDelivery, _claim_mail, send_mail_once


@pytest.fixture
def mail_database(monkeypatch):
    url = make_url(os.environ["DATABASE_URL"])
    assert url.database.endswith("_test")
    schema = "mail_test_" + uuid4().hex
    admin = create_engine(url)
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url.update_query_dict({"options": f"-csearch_path={schema}"}))
    monkeypatch.setattr(storage, "_ENGINE", engine)
    monkeypatch.setattr(storage, "_FACTORY", sessionmaker(engine, expire_on_commit=False))
    monkeypatch.setenv("SOCRATES_MAIL_TRANSPORT", "fixture")
    try:
        storage.Base.metadata.create_all(engine)
        yield
    finally:
        engine.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


def queue_mail(state="PENDING", *, receipt=True):
    with storage.transaction() as db:
        mail = storage.Mail(
            recipient="mail-worker@example.test",
            subject="Verification regression",
            body="Test message",
            state=state,
            next_at=time.time() - 1,
        )
        db.add(mail)
        db.flush()
        if receipt:
            db.add(MailDelivery(mail_id=mail.id, idempotency_key=uuid4().hex, lease_until=0))
        return mail.id


@pytest.mark.parametrize(
    "state,receipt", [("PENDING", True), ("PENDING", False), ("SENDING", True)]
)
def test_delivery_claims_pending_legacy_and_expired_mail(mail_database, state, receipt):
    mail_id = queue_mail(state, receipt=receipt)
    assert send_mail_once() is True
    with storage.transaction() as db:
        mail = db.get(storage.Mail, mail_id)
        delivery = db.get(MailDelivery, mail_id)
        assert mail.state == "SENT"
        assert mail.attempts == 1
        assert delivery.provider_status == "ACCEPTED"
        assert delivery.provider == "fixture"
    assert send_mail_once() is False


def test_claim_skips_mail_locked_by_another_worker(mail_database):
    locked_id = queue_mail()
    with storage.transaction() as other_worker:
        other_worker.scalar(
            select(storage.Mail).where(storage.Mail.id == locked_id).with_for_update()
        )
        assert _claim_mail() is None
        available_id = queue_mail()
        claim = _claim_mail()
        assert claim["mail_id"] == available_id
    claim = _claim_mail()
    assert claim["mail_id"] == locked_id
