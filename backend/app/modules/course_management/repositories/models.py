"""Persistent course, enrollment, activity, and revision records."""

import time
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.modules.platform.repositories.classroom_storage import Base


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    teacher_name: Mapped[str] = mapped_column(String(64))
    intro: Mapped[str] = mapped_column(Text, default="")
    goals: Mapped[str] = mapped_column(Text, default="")
    code: Mapped[str] = mapped_column(String(8), unique=True)
    code_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    updated_at: Mapped[float] = mapped_column(Float, default=time.time)


class Enrollment(Base):
    __tablename__ = "enrollments"
    __table_args__ = (
        UniqueConstraint("course_id", "account_id", name="uq_enrollments_course_account"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    course_id: Mapped[str] = mapped_column(String(36), ForeignKey("courses.id"), index=True)
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), index=True)
    display_name: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[float] = mapped_column(Float, default=time.time)


class Activity(Base):
    __tablename__ = "activities"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    course_id: Mapped[str] = mapped_column(String(36), ForeignKey("courses.id"), index=True)
    title: Mapped[str] = mapped_column(String(300))
    draft: Mapped[dict] = mapped_column(JSON)
    starts_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    ends_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    published_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_revision_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey(
            "activity_revisions.id",
            name="fk_activities_current_revision",
            use_alter=True,
        ),
        nullable=True,
    )
    # Soft delete: hidden from every normal query, rows and revisions kept.
    deleted: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    updated_at: Mapped[float] = mapped_column(Float, default=time.time)


class ActivityRevision(Base):
    __tablename__ = "activity_revisions"
    __table_args__ = (
        UniqueConstraint(
            "activity_id",
            "number",
            name="uq_activity_revisions_activity_number",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    activity_id: Mapped[str] = mapped_column(String(36), ForeignKey("activities.id"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    content: Mapped[dict] = mapped_column(JSON)
    content_hash: Mapped[str] = mapped_column(String(64))
    locked_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
