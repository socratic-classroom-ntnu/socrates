import uuid

from pydantic import BaseModel

from app.domain.types import Action, EndReason, FlowState, MessageRole, SessionStatus, StageStatus


class SessionInfo(BaseModel):
    id: uuid.UUID
    status: SessionStatus
    flow_state: FlowState
    current_stage_index: int
    total_stages: int
    end_reason: EndReason | None = None


class StageView(BaseModel):
    """只描述學生**已經進入**的那一階。未進入的階不會出現在任何回應裡。"""

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
    """`skipped` 的階不回傳 title——否則學生結束後就知道了下一次會遇到什麼，
    §4.1 的不劇透規則會跨 session 失效。"""


class SummaryView(BaseModel):
    core_principle: str
    stage_outcomes: list[StageOutcomeView]


class SessionView(BaseModel):
    """所有會改變狀態的端點共用的回應形狀（設計規格 §9.1）。"""

    session: SessionInfo
    stage: StageView | None
    appended_messages: list[MessageView]
    available_actions: list[Action]
    summary: SummaryView | None


class SessionDetail(BaseModel):
    """GET 專用：回傳完整訊息而非增量。"""

    session: SessionInfo
    stage: StageView | None
    messages: list[MessageView]
    available_actions: list[Action]
    summary: SummaryView | None


class CreateSessionRequest(BaseModel):
    ladder_id: str
