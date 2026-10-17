from typing import Any, Literal

from pydantic import BaseModel, model_validator

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
    reached_stage_keys: tuple[str, ...]

    @model_validator(mode="after")
    def require_summary_scope(self) -> "ProviderRequest":
        if self.kind == "summarize" and not self.reached_stage_keys:
            raise ValueError("summary requires the stages actually reached")
        return self


ProviderResponse = dict[str, Any]
