import time
from uuid import uuid4
from sqlalchemy import (
    ForeignKey,
    JSON,
    Float,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from app.modules.platform.storage import Base


class Job(Base):
    __tablename__ = "llm_jobs"
    __table_args__ = (UniqueConstraint("room_id", "logical_key"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    room_id: Mapped[str] = mapped_column(String(36), ForeignKey("classroom_runs.id"), index=True)
    logical_key: Mapped[str] = mapped_column(String(150))
    kind: Mapped[str] = mapped_column(String(40))
    context: Mapped[dict] = mapped_column(JSON)
    priority: Mapped[int] = mapped_column(Integer)
    state: Mapped[str] = mapped_column(String(20), default="PENDING", index=True)
    next_at: Mapped[float] = mapped_column(Float, default=time.time, index=True)
    lease: Mapped[str | None] = mapped_column(String(36), nullable=True)
    lease_until: Mapped[float] = mapped_column(Float, default=0)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    audit: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class Program(Base):
    __tablename__ = "prompt_programs"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    metadata_json: Mapped[dict] = mapped_column(JSON)
