from sqlalchemy import (
    JSON,
    Boolean,
    Float,
    Integer,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column
from app.modules.platform.storage import Base


class RateBucket(Base):
    __tablename__ = "rate_buckets"
    id: Mapped[str] = mapped_column(String(150), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[float] = mapped_column(Float, index=True)


class FeatureToggle(Base):
    """A 後台 switch an admin changed; registered switches without a row use their default.

    updated_by is an account id without a foreign key: platform never depends on identity-access.
    """

    __tablename__ = "feature_toggles"
    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean)
    updated_at: Mapped[float] = mapped_column(Float)
    updated_by: Mapped[str] = mapped_column(String(36))


class InteractionEvent(Base):
    """One side record for improving the product (後台「分析紀錄」): a request someone made, or a
    model call and its whole response. ``subject`` is a keyed hash of the account id, never the id
    itself, and no name, email or password is kept (platform/interaction_log.py).
    """

    __tablename__ = "interaction_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[float] = mapped_column(Float, index=True)
    # "request" (a change someone made through the API) or "model" (one guarded model call).
    kind: Mapped[str] = mapped_column(String(16), index=True)
    # The route template ("POST /api/v2/solo/attempts/{attempt_id}/{action}") or the program.
    name: Mapped[str] = mapped_column(String(200), index=True)
    subject: Mapped[str | None] = mapped_column(String(24), nullable=True, index=True)
    # HTTP status, or the model call's outcome (passed / retried / fallback / error:<reason>).
    outcome: Mapped[str] = mapped_column(String(80))
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    data: Mapped[dict] = mapped_column(JSON)
