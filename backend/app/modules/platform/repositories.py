from sqlalchemy import (
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
