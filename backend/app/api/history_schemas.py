import uuid
from datetime import datetime

from pydantic import BaseModel

from app.domain.types import EndReason, FlowState, SessionStatus


class SessionHistoryItem(BaseModel):
    id: uuid.UUID
    status: SessionStatus
    flow_state: FlowState
    current_stage_index: int
    total_stages: int
    started_at: datetime
    updated_at: datetime
    ended_at: datetime | None
    end_reason: EndReason | None
    summary_preview: str | None
    stage_title: str | None


class SessionHistoryPage(BaseModel):
    items: list[SessionHistoryItem]
    next_cursor: str | None
