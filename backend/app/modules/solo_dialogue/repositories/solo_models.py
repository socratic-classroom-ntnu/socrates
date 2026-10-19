"""Persistent solo-activity attempts and their messages.

One attempt per student per activity. ``progress`` holds one entry per reached question; the
pure state machine in domain/solo_attempt.py owns its shape.
"""

import time
from uuid import uuid4

from sqlalchemy import JSON, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.modules.platform.repositories.classroom_storage import Base


class SoloAttempt(Base):
    __tablename__ = "solo_attempts"
    __table_args__ = (
        UniqueConstraint("activity_id", "account_id", name="uq_solo_attempts_activity_account"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    activity_id: Mapped[str] = mapped_column(String(36), ForeignKey("activities.id"), index=True)
    revision_id: Mapped[str] = mapped_column(String(36), ForeignKey("activity_revisions.id"))
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), index=True)
    state: Mapped[str] = mapped_column(String(40))
    question_index: Mapped[int] = mapped_column(Integer, default=0)
    progress: Mapped[list] = mapped_column(JSON, default=list)
    pending_key: Mapped[str | None] = mapped_column(String(200), nullable=True)
    pending_since: Mapped[float | None] = mapped_column(Float, nullable=True)
    notice: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    updated_at: Mapped[float] = mapped_column(Float, default=time.time)


class SoloMessage(Base):
    __tablename__ = "solo_messages"
    __table_args__ = (UniqueConstraint("attempt_id", "seq", name="uq_solo_messages_attempt_seq"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    attempt_id: Mapped[str] = mapped_column(String(36), ForeignKey("solo_attempts.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    question_index: Mapped[int] = mapped_column(Integer)
    role: Mapped[str] = mapped_column(String(16))
    text: Mapped[str] = mapped_column(Text)
    # Only tutor messages carry observations; they never appear in the student's view.
    observations: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
