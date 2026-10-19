"""Persistence models owned by Content Authoring."""

import time
from typing import Any

from sqlalchemy import Float, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.modules.platform.storage import Base

from uuid import uuid4
from sqlalchemy import (
    Text,
)


class LibraryReceipt(Base):
    __tablename__ = "library_receipts"

    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    payload_hash: Mapped[str] = mapped_column(String(64))
    response: Mapped[dict[str, Any]] = mapped_column(JSON)


class Script(Base):
    __tablename__ = "scripts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), index=True)
    document: Mapped[dict] = mapped_column(JSON)
    revision: Mapped[int] = mapped_column(Integer, default=1)


class Snapshot(Base):
    __tablename__ = "script_snapshots"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    script_id: Mapped[str] = mapped_column(String(36), ForeignKey("scripts.id"), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    document: Mapped[dict] = mapped_column(JSON)
    content_hash: Mapped[str] = mapped_column(String(64))


# 題庫商店：老師發布到共享題庫的單一題目（路由在 app/modules/content_authoring/routes/question_bank.py）。
class BankQuestion(Base):
    __tablename__ = "bank_questions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), index=True)
    title: Mapped[str] = mapped_column(String(300))
    question: Mapped[dict] = mapped_column(JSON)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    search_text: Mapped[str] = mapped_column(Text, default="")
    source_script_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    source_question_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    published_at: Mapped[float] = mapped_column(Float, default=time.time, index=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
