"""Durable transactional-mail delivery with Resend, fixture, SMTP, and receipts."""

from __future__ import annotations

import base64
import binascii
from email.message import EmailMessage
import hashlib
import hmac
import json
import os
import smtplib
import time
from typing import Any
from uuid import uuid4

import httpx
from sqlalchemy import JSON, Float, ForeignKey, String, Text, and_, or_, select
from sqlalchemy.orm import Mapped, mapped_column

from .orchestrator import DomainError
from .storage import Base, Mail, digest, transaction


class MailDelivery(Base):
    __tablename__ = "r104_mail_delivery"

    mail_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("r2_mail_outbox.id"), primary_key=True
    )
    account_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("r2_accounts.id"), nullable=True, index=True
    )
    purpose: Mapped[str] = mapped_column(String(24), default="transactional", index=True)
    html_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    preview_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    provider: Mapped[str | None] = mapped_column(String(32), nullable=True)
    provider_message_id: Mapped[str | None] = mapped_column(String(160), nullable=True, index=True)
    provider_status: Mapped[str] = mapped_column(String(40), default="QUEUED")
    lease: Mapped[str | None] = mapped_column(String(36), nullable=True)
    lease_until: Mapped[float] = mapped_column(Float, default=0)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    events: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[float] = mapped_column(Float, default=time.time, index=True)
    updated_at: Mapped[float] = mapped_column(Float, default=time.time)
    sent_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    delivered_at: Mapped[float | None] = mapped_column(Float, nullable=True)


class MailDeliveryError(RuntimeError):
    def __init__(self, code: str, *, retryable: bool, retry_after: float = 60):
        self.code = code
        self.retryable = retryable
        self.retry_after = retry_after
        super().__init__(code)


def queue_delivery(
    db,
    mail: Mail,
    *,
    account_id: str | None,
    purpose: str,
    html_body: str,
    preview_url: str,
) -> MailDelivery:
    """Bind a durable delivery receipt to one outbox row."""
    db.flush()
    key = digest(
        {
            "schema": "socrates/mail-idempotency/v1",
            "mail_id": mail.id,
            "recipient": mail.recipient.casefold(),
            "subject": mail.subject,
            "purpose": purpose,
        }
    )
    row = db.get(MailDelivery, mail.id)
    if row is None:
        row = MailDelivery(
            mail_id=mail.id,
            account_id=account_id,
            purpose=purpose,
            html_body=html_body,
            preview_url=preview_url,
            idempotency_key=key,
            provider_status="QUEUED",
        )
        db.add(row)
    return row


def _claim_mail() -> dict | None:
    current = time.time()
    with transaction() as db:
        mail = db.scalar(
            select(Mail)
            .outerjoin(MailDelivery, MailDelivery.mail_id == Mail.id)
            .where(
                or_(
                    and_(
                        Mail.state.in_(["PENDING", "RETRY"]),
                        Mail.next_at <= current,
                    ),
                    and_(
                        Mail.state == "SENDING",
                        or_(
                            MailDelivery.lease_until.is_(None),
                            MailDelivery.lease_until < current,
                        ),
                    ),
                )
            )
            .order_by(Mail.next_at, Mail.id)
            .limit(1)
            # Only the outbox row owns the claim; PostgreSQL cannot lock the
            # nullable delivery side of this outer join.
            .with_for_update(of=Mail, skip_locked=True)
        )
        if mail is None:
            return None
        delivery = db.get(MailDelivery, mail.id)
        if delivery is None:
            delivery = MailDelivery(
                mail_id=mail.id,
                purpose="legacy",
                idempotency_key=digest(
                    {
                        "schema": "socrates/mail-idempotency/v1",
                        "mail_id": mail.id,
                        "recipient": mail.recipient.casefold(),
                        "subject": mail.subject,
                    }
                ),
                provider_status="QUEUED",
            )
            db.add(delivery)
            db.flush()

        lease = str(uuid4())
        mail.state = "SENDING"
        mail.attempts += 1
        delivery.lease = lease
        delivery.lease_until = current + 150
        delivery.provider_status = "SENDING"
        delivery.updated_at = current
        return {
            "mail_id": mail.id,
            "recipient": mail.recipient,
            "subject": mail.subject,
            "text": mail.body,
            "html": delivery.html_body,
            "purpose": delivery.purpose,
            "idempotency_key": delivery.idempotency_key,
            "lease": lease,
            "attempt": mail.attempts,
        }


def _sender() -> str:
    return os.environ.get(
        "RESEND_FROM",
        "Socratic Classroom <verify@mail.socrates.driseam.com>",
    ).strip()


def _resend(claim: dict) -> dict:
    key = os.environ.get("RESEND_API_KEY", "").strip()
    if not key:
        raise MailDeliveryError(
            "RESEND_API_KEY_REFERENCE_REQUIRED",
            retryable=False,
        )
    sender = _sender()
    if "@mail.socrates.driseam.com>" not in sender and not sender.endswith(
        "@mail.socrates.driseam.com"
    ):
        raise MailDeliveryError(
            "RESEND_SENDER_DOMAIN_REQUIRED",
            retryable=False,
        )
    payload: dict[str, Any] = {
        "from": sender,
        "to": [claim["recipient"]],
        "subject": claim["subject"],
        "text": claim["text"],
    }
    if claim.get("html"):
        payload["html"] = claim["html"]
    try:
        with httpx.Client(
            timeout=httpx.Timeout(30, connect=10),
            follow_redirects=False,
        ) as client:
            response = client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": "Bearer " + key,
                    "Content-Type": "application/json",
                    "Idempotency-Key": claim["idempotency_key"],
                },
                json=payload,
            )
    except httpx.HTTPError as exc:
        raise MailDeliveryError(
            "RESEND_TRANSPORT_AVAILABILITY",
            retryable=True,
            retry_after=60,
        ) from exc

    if response.status_code == 429 or response.status_code >= 500:
        retry_header = response.headers.get("retry-after", "60")
        try:
            retry_after = float(retry_header)
        except ValueError:
            retry_after = 60
        raise MailDeliveryError(
            "RESEND_PROVIDER_AVAILABILITY",
            retryable=True,
            retry_after=max(1, min(retry_after, 3600)),
        )
    if response.status_code not in {200, 201}:
        raise MailDeliveryError(
            "RESEND_PROVIDER_CONFIGURATION",
            retryable=False,
        )
    try:
        body = response.json()
        message_id = str(body["id"])
    except (ValueError, KeyError, TypeError) as exc:
        raise MailDeliveryError(
            "RESEND_PROVIDER_RECEIPT",
            retryable=True,
            retry_after=60,
        ) from exc
    return {
        "provider": "resend",
        "provider_message_id": message_id,
        "provider_status": "ACCEPTED",
    }


def _fixture(claim: dict) -> dict:
    return {
        "provider": "fixture",
        "provider_message_id": "fixture-" + claim["mail_id"],
        "provider_status": "ACCEPTED",
    }


def _smtp(claim: dict) -> dict:
    host = os.environ.get("SMTP_HOST", "").strip()
    if not host:
        raise MailDeliveryError(
            "SMTP_HOST_REFERENCE_REQUIRED",
            retryable=False,
        )
    message = EmailMessage()
    message["From"] = os.environ.get("SMTP_FROM", _sender())
    message["To"] = claim["recipient"]
    message["Subject"] = claim["subject"]
    message.set_content(claim["text"])
    if claim.get("html"):
        message.add_alternative(claim["html"], subtype="html")
    try:
        port = int(os.environ.get("SMTP_PORT", "587"))
        with smtplib.SMTP(host, port, timeout=15) as smtp:
            if os.environ.get("SMTP_STARTTLS", "true").casefold() == "true":
                smtp.starttls()
            if os.environ.get("SMTP_USER"):
                smtp.login(
                    os.environ["SMTP_USER"],
                    os.environ.get("SMTP_PASSWORD", ""),
                )
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException) as exc:
        raise MailDeliveryError(
            "SMTP_TRANSPORT_AVAILABILITY",
            retryable=True,
            retry_after=60,
        ) from exc
    return {
        "provider": "smtp",
        "provider_message_id": "smtp-" + claim["mail_id"],
        "provider_status": "ACCEPTED",
    }


def _complete(claim: dict, receipt: dict) -> None:
    current = time.time()
    with transaction() as db:
        mail = db.scalar(select(Mail).where(Mail.id == claim["mail_id"]).with_for_update())
        delivery = db.get(MailDelivery, claim["mail_id"])
        if mail is None or delivery is None or delivery.lease != claim["lease"]:
            return
        mail.state = "SENT"
        mail.body = "DELIVERED"
        delivery.html_body = None
        delivery.provider = receipt["provider"]
        delivery.provider_message_id = receipt["provider_message_id"]
        delivery.provider_status = receipt["provider_status"]
        delivery.last_error = None
        delivery.sent_at = current
        delivery.updated_at = current
        delivery.lease = None
        delivery.lease_until = 0
        events = list(delivery.events or [])
        events.append(
            {
                "type": "email.accepted",
                "at": current,
                "provider": receipt["provider"],
                "provider_message_id": receipt["provider_message_id"],
            }
        )
        delivery.events = events[-20:]


def _repair(claim: dict, error: MailDeliveryError) -> None:
    current = time.time()
    with transaction() as db:
        mail = db.scalar(select(Mail).where(Mail.id == claim["mail_id"]).with_for_update())
        delivery = db.get(MailDelivery, claim["mail_id"])
        if mail is None or delivery is None or delivery.lease != claim["lease"]:
            return
        if error.retryable:
            mail.state = "RETRY"
            exponent = min(mail.attempts, 6)
            mail.next_at = current + min(
                3600,
                max(error.retry_after, 30 * 2**exponent),
            )
            delivery.provider_status = "RETRY_SCHEDULED"
        else:
            mail.state = "ACTION_REQUIRED"
            delivery.provider_status = "AUTHORITY_RECEIPT_REQUIRED"
        delivery.last_error = error.code
        delivery.updated_at = current
        delivery.lease = None
        delivery.lease_until = 0
        events = list(delivery.events or [])
        events.append(
            {
                "type": "email.delivery_state",
                "at": current,
                "state": delivery.provider_status,
                "code": error.code,
            }
        )
        delivery.events = events[-20:]


def send_mail_once() -> bool:
    """Claim and deliver at most one row; returns whether a row was processed."""
    claim = _claim_mail()
    if claim is None:
        return False
    transport = (
        os.environ.get(
            "SOCRATES_MAIL_TRANSPORT",
            "fixture",
        )
        .strip()
        .casefold()
    )
    try:
        if transport == "resend":
            receipt = _resend(claim)
        elif transport == "smtp":
            receipt = _smtp(claim)
        elif transport == "fixture":
            receipt = _fixture(claim)
        else:
            raise MailDeliveryError(
                "MAIL_TRANSPORT_REQUIRED",
                retryable=False,
            )
        _complete(claim, receipt)
    except MailDeliveryError as error:
        _repair(claim, error)
    return True


def delivery_status(db, *, account_id: str, purpose: str = "verify") -> dict:
    row = db.scalar(
        select(MailDelivery)
        .where(
            MailDelivery.account_id == account_id,
            MailDelivery.purpose == purpose,
        )
        .order_by(MailDelivery.created_at.desc())
        .limit(1)
    )
    if row is None:
        return {
            "state": "READY_TO_REQUEST",
            "provider": None,
            "provider_message_id": None,
            "provider_status": None,
        }
    value = {
        "state": row.provider_status,
        "provider": row.provider,
        "provider_message_id": row.provider_message_id,
        "provider_status": row.provider_status,
        "attempts": None,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "sent_at": row.sent_at,
        "delivered_at": row.delivered_at,
        "last_error": row.last_error,
    }
    environment = os.environ.get(
        "SOCRATES_ENVIRONMENT",
        "local-dev",
    )
    transport = os.environ.get(
        "SOCRATES_MAIL_TRANSPORT",
        "fixture",
    ).casefold()
    if environment != "stage" and transport == "fixture":
        value["preview_url"] = row.preview_url
    return value


def _svix_secret() -> bytes:
    raw = os.environ.get("RESEND_WEBHOOK_SECRET", "").strip()
    if not raw:
        raise DomainError("RESEND_WEBHOOK_SECRET_REQUIRED", 503)
    if raw.startswith("whsec_"):
        raw = raw[6:]
    try:
        return base64.b64decode(raw + "=" * (-len(raw) % 4))
    except (ValueError, binascii.Error) as exc:
        raise DomainError("RESEND_WEBHOOK_SECRET_FORMAT", 503) from exc


def verify_resend_webhook(
    body: bytes,
    *,
    svix_id: str,
    svix_timestamp: str,
    svix_signature: str,
) -> None:
    try:
        timestamp = int(svix_timestamp)
    except ValueError as exc:
        raise DomainError("RESEND_WEBHOOK_TIMESTAMP", 400) from exc
    if abs(time.time() - timestamp) > 300:
        raise DomainError("RESEND_WEBHOOK_FRESHNESS", 400)
    signed = f"{svix_id}.{svix_timestamp}.".encode() + body
    expected = base64.b64encode(hmac.new(_svix_secret(), signed, hashlib.sha256).digest()).decode()
    candidates = []
    for item in svix_signature.split():
        if item.startswith("v1,"):
            candidates.append(item.split(",", 1)[1])
    if not candidates or not any(
        hmac.compare_digest(expected, candidate) for candidate in candidates
    ):
        raise DomainError("RESEND_WEBHOOK_SIGNATURE", 400)


def apply_resend_webhook(body: bytes, headers) -> dict:
    verify_resend_webhook(
        body,
        svix_id=headers.get("svix-id", ""),
        svix_timestamp=headers.get("svix-timestamp", ""),
        svix_signature=headers.get("svix-signature", ""),
    )
    try:
        event = json.loads(body)
    except ValueError as exc:
        raise DomainError("RESEND_WEBHOOK_JSON", 400) from exc
    event_type = str(event.get("type", ""))
    data = event.get("data") or {}
    provider_message_id = data.get("email_id") or data.get("id") or data.get("email", {}).get("id")
    if not provider_message_id:
        return {"status": "RECORDED", "matched": False}

    mapping = {
        "email.sent": "SENT",
        "email.delivered": "DELIVERED",
        "email.delivery_delayed": "DELIVERY_DELAYED",
        "email.bounced": "BOUNCED",
        "email.complained": "COMPLAINED",
        "email.opened": "OPENED",
        "email.clicked": "CLICKED",
    }
    status = mapping.get(event_type, event_type.upper()[:40] or "EVENT")
    current = time.time()
    with transaction() as db:
        row = db.scalar(
            select(MailDelivery)
            .where(MailDelivery.provider_message_id == str(provider_message_id))
            .with_for_update()
        )
        if row is None:
            return {"status": "RECORDED", "matched": False}
        row.provider_status = status
        row.updated_at = current
        if status == "DELIVERED":
            row.delivered_at = current
        events = list(row.events or [])
        events.append(
            {
                "type": event_type,
                "at": current,
                "provider_message_id": str(provider_message_id),
            }
        )
        row.events = events[-20:]
    return {
        "status": "RECORDED",
        "matched": True,
        "provider_status": status,
    }


def mask_recipient(email: str) -> str:
    local, _, domain = email.partition("@")
    if not domain:
        return "•••"
    visible = local[:2] if len(local) >= 2 else local[:1]
    return visible + "•••@" + domain
