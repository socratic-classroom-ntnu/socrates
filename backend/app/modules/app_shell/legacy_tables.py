"""Tables of the legacy solo dialogue, kept as schema only.

The code that used these tables was removed; the tables stay until dropping them is coordinated
with the database owner. The definitions match migrations 0001–0005, so
tests/migrations/test_schema_matches_orm.py keeps comparing them. Nothing reads or writes them.
"""

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.modules.platform.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Learner(Base):
    __tablename__ = "learners"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    learner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("learners.id"), index=True)
    ladder_id: Mapped[str] = mapped_column(String(64))
    ladder_version: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16))
    flow_state: Mapped[str] = mapped_column(String(32))
    current_stage_index: Mapped[int] = mapped_column(Integer, default=0)
    extra_turns_used: Mapped[int] = mapped_column(Integer, default=0)
    parent_session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=True
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_reason: Mapped[str | None] = mapped_column(String(32), nullable=True)


Index(
    "uq_sessions_one_active_per_learner",
    Session.learner_id,
    unique=True,
    postgresql_where=text("status = 'active'"),
)


class StageProgress(Base):
    __tablename__ = "stage_progress"
    __table_args__ = (UniqueConstraint("session_id", "stage_index"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id"), index=True)
    stage_index: Mapped[int] = mapped_column(Integer)
    stage_key: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32))
    turn_count: Mapped[int] = mapped_column(Integer, default=0)
    principle_label: Mapped[str] = mapped_column(String(16), default="未明")
    position_shifted: Mapped[bool] = mapped_column(Boolean, default=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (UniqueConstraint("session_id", "seq"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    stage_index: Mapped[int] = mapped_column(Integer)
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    observations: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Summary(Base):
    __tablename__ = "summaries"

    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id"), primary_key=True)
    core_principle: Mapped[str] = mapped_column(Text)
    tension: Mapped[str] = mapped_column(Text)
    stance_by_stage: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    shifted: Mapped[bool] = mapped_column(Boolean)
    raw: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


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
