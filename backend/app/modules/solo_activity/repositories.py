"""Persistent solo-activity attempts and their messages.

One attempt per student per activity. ``progress`` holds one entry per scenario of the sequence so
far; the pure state machine in attempt_machine.py owns its shape.
"""

import time
from uuid import uuid4

from sqlalchemy import JSON, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.modules.platform.storage import Base


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
    scenario_index: Mapped[int] = mapped_column(Integer, default=0)
    progress: Mapped[list] = mapped_column(JSON, default=list)
    pending_key: Mapped[str | None] = mapped_column(String(200), nullable=True)
    pending_since: Mapped[float | None] = mapped_column(Float, nullable=True)
    notice: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # The final summary step (attempt_machine.FinalProgress); None on rows saved before O6.
    final: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    updated_at: Mapped[float] = mapped_column(Float, default=time.time)


class SoloMessage(Base):
    __tablename__ = "solo_messages"
    __table_args__ = (UniqueConstraint("attempt_id", "seq", name="uq_solo_messages_attempt_seq"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    attempt_id: Mapped[str] = mapped_column(String(36), ForeignKey("solo_attempts.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    # The scenario of the sequence this message belongs to.
    scenario_index: Mapped[int] = mapped_column(Integer)
    role: Mapped[str] = mapped_column(String(16))
    text: Mapped[str] = mapped_column(Text)
    # Only tutor messages carry observations; they never appear in the student's view.
    observations: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Student: {revise_hint} after 不太對, kept for statistics. Tutor: {move}.
    meta: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)


class SoloRadar(Base):
    """The teacher's radar for one activity, as last computed (NEW-FEATURES 3.4).

    ``basis`` fingerprints the final summaries it was computed from (revision, attempts, their
    kept summaries); a new or changed summary makes it stale and the next read computes it again,
    which also drops the teacher's axis names. ``dimensions`` and ``students`` hold the RadarView
    payload as served.
    """

    __tablename__ = "solo_radars"

    activity_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("activities.id"), primary_key=True
    )
    basis: Mapped[str] = mapped_column(String(64))
    dimensions: Mapped[list] = mapped_column(JSON)
    students: Mapped[list] = mapped_column(JSON)
    computed_at: Mapped[float] = mapped_column(Float, default=time.time)


class VoiceUsage(Base):
    """Seconds of voice time one account used on one day (Asia/Taipei); no audio is ever kept."""

    __tablename__ = "solo_voice_usage"

    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), primary_key=True)
    day: Mapped[str] = mapped_column(String(10), primary_key=True)
    seconds: Mapped[float] = mapped_column(Float, default=0.0)
    updated_at: Mapped[float] = mapped_column(Float, default=time.time)
