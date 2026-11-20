from sqlalchemy import (
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
