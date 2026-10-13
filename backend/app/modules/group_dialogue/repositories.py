"""Persistence models owned by Group Dialogue."""

import time
from typing import Any

from sqlalchemy import Boolean, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.repositories.classroom_storage import Base


class AIStudentProfile(Base):  # type: ignore[misc]
    __tablename__ = "ai_students"

    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), primary_key=True)
    parent_room_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("classroom_runs.id"), index=True
    )
    persona: Mapped[dict[str, Any]] = mapped_column(JSON)
    model: Mapped[str] = mapped_column(String(160), default="openrouter/free")
    provider_profile_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("provider_profiles.id"), nullable=True
    )
    seed: Mapped[int] = mapped_column(Integer)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
