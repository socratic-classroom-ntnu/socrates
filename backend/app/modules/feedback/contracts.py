"""意見回饋的 API 形狀。長度上限在 service 檢查，才能回穩定的錯誤碼（spec P19）。"""

from typing import Literal

from pydantic import BaseModel, Field

from app.modules.platform.model_base import TrimmedModel

FeedbackKind = Literal["problem", "suggestion", "other"]
FeedbackIdentity = Literal["teacher", "student", "guest", "anonymous"]
ScreenshotMime = Literal["image/png", "image/jpeg", "image/webp"]
AccountKind = Literal["registered", "guest", "expired_guest", "deleted"]


class Viewport(TrimmedModel):
    w: int = Field(ge=1, le=10000)
    h: int = Field(ge=1, le=10000)


class ScreenshotUpload(TrimmedModel):
    # 不用 Literal：類型不對也要回穩定的 FEEDBACK_SCREENSHOT_INVALID（P5）
    mime: str
    data_base64: str


class FeedbackCreate(TrimmedModel):
    kind: FeedbackKind | None = None
    message: str
    contact: str | None = None
    # 只收站內路徑：單一個 / 開頭（spec P19、審查 S2-2）
    page: str = Field(pattern=r"^/([^/].*)?$")
    viewport: Viewport
    locale: str = Field(max_length=16)
    screenshot: ScreenshotUpload | None = None


class FeedbackCreated(BaseModel):
    id: str


class FeedbackItem(BaseModel):
    id: str
    created_at: float
    kind: FeedbackKind | None
    message: str
    contact: str | None
    page: str
    viewport_w: int
    viewport_h: int
    locale: str
    user_agent: str
    release_id: str
    identity: FeedbackIdentity
    account_kind: AccountKind | None
    account_name: str | None
    has_screenshot: bool


class FeedbackScreenshot(BaseModel):
    mime: ScreenshotMime
    data_base64: str


class FeedbackPage(BaseModel):
    items: list[FeedbackItem]
    page: int
    has_more: bool
