"""Persistence models owned by Identity & Access."""

import time
from typing import Any

from sqlalchemy import Float, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.repositories.classroom_storage import Base


class MailDelivery(Base):  # type: ignore[misc]
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
