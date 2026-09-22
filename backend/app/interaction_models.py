import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class TranscriptDraft(Base):
    __tablename__ = "transcript_drafts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id"), index=True)
    learner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("learners.id"), index=True)
    text: Mapped[str] = mapped_column(Text)
    adapter: Mapped[str] = mapped_column(String(64))
    locale: Mapped[str] = mapped_column(String(32), default="zh-TW")
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    discarded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class InteractionEvent(Base):
    __tablename__ = "interaction_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id"), index=True)
    learner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("learners.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
