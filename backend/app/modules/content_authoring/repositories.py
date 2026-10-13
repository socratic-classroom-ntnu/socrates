"""Persistence models owned by Content Authoring."""

import time
from typing import Any

from sqlalchemy import Float, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.repositories.classroom_storage import Base


class ClassroomAssets(Base):  # type: ignore[misc]
    __tablename__ = "classroom_assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    revision: Mapped[int] = mapped_column(Integer, default=1)
    assets: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)


class SessionLink(Base):  # type: ignore[misc]
    __tablename__ = "classroom_sessions"

    room_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("classroom_runs.id"), primary_key=True
    )
    classroom_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("classroom_assets.id"), index=True
    )
    batch_id: Mapped[str] = mapped_column(String(36), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[float] = mapped_column(Float, default=time.time)


class LibraryReceipt(Base):  # type: ignore[misc]
    __tablename__ = "library_receipts"

    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    payload_hash: Mapped[str] = mapped_column(String(64))
    response: Mapped[dict[str, Any]] = mapped_column(JSON)
