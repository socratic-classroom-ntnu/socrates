"""What the tutor returns in a solo activity: one follow-up, observations, a candidate summary.

Same shape as classroom_core's PersonalTutorTurn (the schema of the solo_tutor prompt), copied
because solo_dialogue cannot import classroom_core; tests/solo_activity locks the two together.
The backend policy decides whether to confirm; the provider only observes.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.llm_runtime.domain.tutor import Observations


class SoloSummary(BaseModel):
    """The tutor's candidate reading of the student's stance; the student confirms or revises it."""

    model_config = ConfigDict(extra="forbid")

    current_position: str = Field(min_length=1, max_length=2000)
    reason_summary: str = Field(min_length=1, max_length=4000)
    relevant_conditions: list[str] = Field(default_factory=list, max_length=12)
    unresolved_issue: str = Field(default="", max_length=2000)


class SoloTutorTurn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reply_text: str = Field(min_length=1, max_length=16000)
    observations: Observations
    move: Literal["probe", "clarify", "challenge", "reflect", "summarize"] = "probe"
    summary: SoloSummary
