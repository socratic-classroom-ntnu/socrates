import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.domain.types import (
    EndReason,
    FlowState,
    MessageRole,
    PrincipleLabel,
    SessionStatus,
    StageStatus,
)


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
    status: Mapped[SessionStatus] = mapped_column(String(16))
    flow_state: Mapped[FlowState] = mapped_column(String(32))
    current_stage_index: Mapped[int] = mapped_column(Integer, default=0)
    extra_turns_used: Mapped[int] = mapped_column(Integer, default=0)
    parent_session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=True
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_reason: Mapped[EndReason | None] = mapped_column(String(32), nullable=True)

    stage_progress: Mapped[list["StageProgress"]] = relationship(
        back_populates="session", order_by="StageProgress.stage_index", lazy="selectin"
    )
    messages: Mapped[list["Message"]] = relationship(
        back_populates="session", order_by="Message.seq", lazy="selectin"
    )


class StageProgress(Base):
    __tablename__ = "stage_progress"
    __table_args__ = (UniqueConstraint("session_id", "stage_index"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id"), index=True)
    stage_index: Mapped[int] = mapped_column(Integer)
    stage_key: Mapped[str] = mapped_column(String(64))
    status: Mapped[StageStatus] = mapped_column(String(32))
    turn_count: Mapped[int] = mapped_column(Integer, default=0)
    principle_label: Mapped[PrincipleLabel] = mapped_column(String(16), default="未明")
    position_shifted: Mapped[bool] = mapped_column(Boolean, default=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    session: Mapped["Session"] = relationship(back_populates="stage_progress")


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (UniqueConstraint("session_id", "seq"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    stage_index: Mapped[int] = mapped_column(Integer)
    role: Mapped[MessageRole] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    observations: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    session: Mapped["Session"] = relationship(back_populates="messages")


class Summary(Base):
    __tablename__ = "summaries"

    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id"), primary_key=True)
    core_principle: Mapped[str] = mapped_column(Text)
    tension: Mapped[str] = mapped_column(Text)
    stance_by_stage: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    shifted: Mapped[bool] = mapped_column(Boolean)
    raw: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
