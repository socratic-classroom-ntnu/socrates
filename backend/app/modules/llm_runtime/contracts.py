"""Public structured-output contracts owned by LLM Runtime."""

from typing import Literal
from pydantic import Field, field_validator, model_validator
from app.modules.platform.contracts import Strict


class Option(Strict):
    id: str = Field(min_length=1, max_length=64)
    text: str = Field(min_length=1, max_length=2000)


class PublicQuestion(Strict):
    """A question as students and the LLM see it: no teacher-only routing fields."""

    id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=300)
    scenario: str = Field(min_length=1, max_length=12000)
    options: list[Option] = Field(min_length=2)
    duration_seconds: int = Field(default=90, ge=1)
    argument_required: bool = True
    tutor_goal: str = Field(default="協助學生照見自己的立場與理由。", max_length=2000)
    probe_hints: list[str] = Field(
        default_factory=lambda: ["你採用的原則是什麼？條件改變時，你會如何判斷？"], max_length=20
    )
    max_focus_turns: int = Field(default=3, ge=1)
    focus_response_seconds: int = Field(default=90, ge=5)
    sender_point_cap: int = Field(default=5, ge=0)
    receiver_point_cap: int = Field(default=25, ge=0)
    # Group runs: each student's own follow-up dialogue before the multi-person stage.
    max_personal_turns: int = Field(default=6, ge=1, le=20)
    personal_seconds: int = Field(default=600, ge=30)

    @field_validator("probe_hints")
    @classmethod
    def probe_hint_length(cls, hints: list[str]) -> list[str]:
        if any(len(hint) > 2000 for hint in hints):
            raise ValueError("每則追問方向最多 2000 字")
        return hints

    @model_validator(mode="after")
    def distinct(self) -> "PublicQuestion":
        if len({o.id for o in self.options}) != len(self.options):
            raise ValueError("選項 id 請各自唯一")
        return self


class Observations(Strict):
    # Every field is required: a reply that omits one is a failed reply, not "not met"
    # (design spec §13.2 layer 3).
    has_position: bool
    has_reason: bool
    reason_tested: bool
    position_shifted: bool
    principle_label: Literal["後果主義", "義務論", "混合", "未明"]


Guard = Literal["on_topic", "off_topic", "instruction_override"]


class TutorTurn(Strict):
    reply_text: str = Field(min_length=1, max_length=16000)
    observations: Observations
    move: Literal["probe", "clarify", "challenge", "reflect", "summarize"] = "probe"
    micro_summary: str = ""
    guard: Guard = "on_topic"


class PersonalSummary(Strict):
    """The tutor's candidate reading of one student's stance; the student confirms or revises it."""

    current_position: str = Field(min_length=1, max_length=2000)
    reason_summary: str = Field(min_length=1, max_length=4000)
    relevant_conditions: list[str] = Field(default_factory=list, max_length=12)
    unresolved_issue: str = Field(default="", max_length=2000)


class PersonalTutorTurn(Strict):
    """personal_tutor output: one follow-up plus observations; the backend policy decides."""

    reply_text: str = Field(min_length=1, max_length=16000)
    observations: Observations
    move: Literal["probe", "clarify", "challenge", "reflect", "summarize"] = "probe"
    summary: PersonalSummary
    guard: Guard = "on_topic"


class SummaryResult(Strict):
    text: str = Field(min_length=1, max_length=20000)
    key_points: list[str] = Field(default_factory=list)


class DynamicResult(Strict):
    """Generated question envelope; routing fields are forbidden by PublicQuestion."""

    question: PublicQuestion


class LLMStudentTurn(Strict):
    action_mode: Literal["answer", "focus", "viewpoint", "final_reflection"]
    option_id: str = ""
    text: str = Field(min_length=1, max_length=12000)
    relation: Literal["supports", "challenges", "qualifies", "revises"] = "qualifies"
    should_confirm: bool = True
    guard: Guard = "on_topic"


class OtherSuggestionResult(Strict):
    suggestion_text: str = Field(min_length=1, max_length=1000)


class ScriptAssistResult(Strict):
    """Structured output for the AI-assisted authoring use case."""

    title: str = Field(min_length=1, max_length=300)
    scenario: str = Field(min_length=1, max_length=12000)
    options: list[str] = Field(min_length=2, max_length=4)
    tutor_goal: str = Field(min_length=1, max_length=2000)
    probe_hints: list[str] = Field(min_length=1, max_length=6)
    rationale: str = Field(max_length=2000)
