from typing import Any, Literal

from pydantic import BaseModel

from app.domain.types import PrincipleLabel


from app.modules.llm_runtime.contracts import Observations as Observations


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
