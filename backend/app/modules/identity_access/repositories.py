"""Persistence models owned by Identity & Access."""

import time
from typing import Any

from sqlalchemy import Float, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.modules.platform.storage import Base

from uuid import uuid4
from sqlalchemy import (
    Boolean,
    Integer,
)


class MailDelivery(Base):
    __tablename__ = "mail_delivery"

    mail_id: Mapped[str] = mapped_column(String(36), ForeignKey("mail_outbox.id"), primary_key=True)
    account_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("accounts.id"), nullable=True, index=True
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
    events: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    created_at: Mapped[float] = mapped_column(Float, default=time.time, index=True)
    updated_at: Mapped[float] = mapped_column(Float, default=time.time)
    sent_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    delivered_at: Mapped[float | None] = mapped_column(Float, nullable=True)


class Account(Base):
    __tablename__ = "accounts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    username: Mapped[str] = mapped_column(String(64), unique=True)
    # Null for guests, who have neither; unique only among accounts that have one.
    email: Mapped[str | None] = mapped_column(String(254), unique=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    locale: Mapped[str | None] = mapped_column(String(8), nullable=True)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    # "guest" (joined without registering, found only by its session cookie), "expired_guest"
    # (past guest_expires_at; the account and its records stay) or "registered".
    kind: Mapped[str] = mapped_column(String(16), default="registered", server_default="registered")
    # Guests only: 168 hours after joining, never extended.
    guest_expires_at: Mapped[float | None] = mapped_column(Float, nullable=True, index=True)


class LoginSession(Base):
    __tablename__ = "login_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), index=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[float] = mapped_column(Float, index=True)


class EmailToken(Base):
    __tablename__ = "email_tokens"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), index=True)
    purpose: Mapped[str] = mapped_column(String(16))
    expires_at: Mapped[float] = mapped_column(Float)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)


class Mail(Base):
    __tablename__ = "mail_outbox"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    recipient: Mapped[str] = mapped_column(String(254))
    subject: Mapped[str] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text)
    state: Mapped[str] = mapped_column(String(20), default="PENDING")
    next_at: Mapped[float] = mapped_column(Float, default=time.time)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
