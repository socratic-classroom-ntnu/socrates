"""意見回饋：試用使用者與 QA 從右下角按鈕送來的一筆回報，可附一張截圖。

`identity` 是送出當下的身分（teacher／student／guest／anonymous），之後帳號怎麼變都不改；
訪客登入正式帳號時回饋不跟著併過去（spec P20）。截圖 90 天後清掉，文字留著（P10）。
"""

import time
from uuid import uuid4

from sqlalchemy import Float, ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.modules.platform.storage import Base


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    created_at: Mapped[float] = mapped_column(Float, default=time.time, index=True)
    kind: Mapped[str | None] = mapped_column(String(16), nullable=True)
    message: Mapped[str] = mapped_column(Text)
    contact: Mapped[str | None] = mapped_column(String(200), nullable=True)
    page: Mapped[str] = mapped_column(String(500))
    viewport_w: Mapped[int] = mapped_column(Integer)
    viewport_h: Mapped[int] = mapped_column(Integer)
    locale: Mapped[str] = mapped_column(String(16))
    user_agent: Mapped[str] = mapped_column(String(400))
    release_id: Mapped[str] = mapped_column(String(80))
    source_sha: Mapped[str] = mapped_column(String(64))
    account_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    identity: Mapped[str] = mapped_column(String(16))
    screenshot: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    screenshot_mime: Mapped[str | None] = mapped_column(String(16), nullable=True)
    screenshot_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
