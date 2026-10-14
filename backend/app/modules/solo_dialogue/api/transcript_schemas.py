import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class TranscriptDraftCreate(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    adapter: str = Field(default="browser-speech", min_length=1, max_length=64)
    locale: str = Field(default="zh-TW", min_length=2, max_length=32)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)


class TranscriptDraftView(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    text: str
    adapter: str
    locale: str
    confidence: float | None
    status: str
    created_at: datetime
    confirmed_at: datetime | None
    discarded_at: datetime | None
