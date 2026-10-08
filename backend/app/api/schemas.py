import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.domain.types import Action, EndReason, FlowState, MessageRole, SessionStatus, StageStatus


class SessionInfo(BaseModel):
    id: uuid.UUID
    status: SessionStatus
    flow_state: FlowState
    current_stage_index: int
    total_stages: int
    end_reason: EndReason | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    updated_at: datetime | None = None


class StageView(BaseModel):
    """只描述學生已經進入的情境。"""

    index: int
    key: str
    title: str
    opening_statement: str


class MessageView(BaseModel):
    seq: int
    role: MessageRole
    content: str


class StageOutcomeView(BaseModel):
    index: int
    status: StageStatus
    title: str | None


class SummaryView(BaseModel):
    discussion_topic: str = "電車難題：選擇、責任與原則"
    core_principle: str
    key_points: list[str] = Field(default_factory=list)
    tension: str = ""
    reflection_excerpt: str | None = None
    stage_outcomes: list[StageOutcomeView]


class SessionView(BaseModel):
    session: SessionInfo
    stage: StageView | None
    appended_messages: list[MessageView]
    available_actions: list[Action]
    summary: SummaryView | None


class SessionDetail(BaseModel):
    session: SessionInfo
    stage: StageView | None
    messages: list[MessageView]
    available_actions: list[Action]
    summary: SummaryView | None


class CreateSessionRequest(BaseModel):
    ladder_id: str
    restart_existing: bool = Field(default_factory=bool)


class ReleaseView(BaseModel):
    release_id: str
    source_sha: str
    environment: str
    alembic_revision: str
    built_at: str
