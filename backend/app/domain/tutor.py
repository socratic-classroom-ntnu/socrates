from typing import Any, Literal

from pydantic import BaseModel

from app.domain.types import PrincipleLabel


class Observations(BaseModel):
    """Provider 每輪回報的觀察。

    刻意**不含**「是否達成」——判準由 StageAdvancePolicy 套用（設計規格 §12）。
    讓模型直接說「達成了」等於把規則藏進模型裡：不可驗證、換家模型就變。
    """

    has_position: bool
    has_reason: bool
    reason_tested: bool
    principle_label: PrincipleLabel
    position_shifted: bool


class TutorTurn(BaseModel):
    reply_text: str
    observations: Observations


class StanceEntry(BaseModel):
    stage_key: str
    label: PrincipleLabel
    note: str


class SummaryDraft(BaseModel):
    core_principle: str
    tension: str
    stance_by_stage: list[StanceEntry]
    shifted: bool


class PromptMessage(BaseModel):
    role: Literal["student", "tutor"]
    content: str


class ProviderRequest(BaseModel):
    kind: Literal["respond", "summarize"]
    stage_key: str | None
    turn_index: int
    messages: list[PromptMessage]


ProviderResponse = dict[str, Any]
