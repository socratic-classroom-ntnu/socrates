"""Public structured-output contracts owned by LLM Runtime."""

from typing import Annotated, Literal
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
    # Why the reasons sit near observations.principle_label; empty when the label is 未明.
    principle_note: str = Field(default="", max_length=300)


class PersonalTutorTurn(Strict):
    """personal_tutor output: one follow-up plus observations; the backend policy decides."""

    reply_text: str = Field(min_length=1, max_length=16000)
    observations: Observations
    # hypothetical: the follow-up poses an extended scenario the original question does not have.
    move: Literal["probe", "clarify", "challenge", "reflect", "summarize", "hypothetical"] = "probe"
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


# --- Solo activity (docs/classroom/PROMPT-DESIGN.md) ---
# Every 0/1 flag is an integer with ge/le rather than Literal[0, 1]: Gemini's responseSchema has
# documented enums for strings only, while all three providers accept integer minimum/maximum.
Flag = Annotated[int, Field(ge=0, le=1)]


class SoloFlags(Strict):
    """Ten 0/1 judgments about the student's latest message only (PROMPT-DESIGN §3).

    Every field is required: a reply that omits one is a failed reply, not 0. Metrics are computed
    from these by the backend; the student never sees them.
    """

    off_topic: Flag
    malicious_off_topic: Flag
    danger_tendency: Flag
    low_effort: Flag
    gave_reason: Flag
    used_example: Flag
    considered_counterpoint: Flag
    built_on_tutor: Flag
    asked_question: Flag
    self_corrected: Flag


class SoloObservations(Observations):
    """Observations plus the stance id, so policy.should_advance accepts them unchanged."""

    # The stance-space id the student holds; null (never "") before they state a position.
    stance_id: str | None = Field(min_length=1, max_length=64)


class Citation(Strict):
    """One quote from the transcript. The backend checks message_ref belongs to this student and
    attempt and that quote is a substring of that message; invalid citations are dropped, not
    fatal, so neither field carries a pattern here."""

    message_ref: str = Field(min_length=1, max_length=16)
    quote: str = Field(min_length=1, max_length=500)


class SummaryPoint(Strict):
    text: str = Field(min_length=1, max_length=1000)
    sources: list[Citation] = Field(max_length=5)


class CitedSummary(Strict):
    """The cited summary shape (§5); the final summary builds on it."""

    points: list[SummaryPoint] = Field(min_length=1, max_length=8)


class SoloSummary(PersonalSummary):
    """The per-turn candidate summary, plus the student's words it rests on."""

    sources: list[Citation] = Field(max_length=5)


class SoloTutorTurn(Strict):
    """solo_tutor output: one Socratic reply in output_locale plus flags and observations."""

    reply_text: str = Field(min_length=1, max_length=16000)
    move: Literal["probe", "clarify", "challenge", "reflect", "hypothetical", "summarize"]
    observations: SoloObservations
    flags: SoloFlags
    # Every turn, as in PersonalTutorTurn: the backend decides from this turn's observations
    # whether the student confirms, so the summary must already be there.
    summary: SoloSummary
    guard: Guard


class Stance(Strict):
    id: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=2000)


class ActivityExpansion(Strict):
    """activity_expansion output: the teacher's narrative → a stance space and probe directions.

    The teacher reviews and edits this before it is locked into the ActivityRevision.
    """

    stances: list[Stance] = Field(min_length=2, max_length=6)
    tutor_goal: str = Field(min_length=1, max_length=2000)
    probe_hints: list[str] = Field(min_length=1, max_length=6)

    @model_validator(mode="after")
    def distinct(self) -> "ActivityExpansion":
        if len({s.id for s in self.stances}) != len(self.stances):
            raise ValueError("立場 id 請各自唯一")
        return self


class StanceClassification(Strict):
    """stance_classify output: which stance in the space the student's free text states.

    stance_id is null when the student has not yet stated a recognisable claim or none fits;
    the backend, not the model, checks the id exists in the activity's stance space.
    """

    stance_id: str | None = Field(min_length=1, max_length=64)
    confidence: Literal["low", "medium", "high"]
    rationale: str = Field(min_length=1, max_length=1000)


class TrajectoryStep(Strict):
    """One confirmed stage of the student's thinking, oldest first."""

    stance_id: str | None = Field(min_length=1, max_length=64)
    position: str = Field(min_length=1, max_length=2000)
    # Why the student moved here from the previous step; empty for the first step.
    shift_reason: str = Field(max_length=2000)
    sources: list[Citation] = Field(max_length=5)


class FinalSummary(CitedSummary):
    """final_summary output: a cited summary of the confirmed stages, plus the line of thought."""

    trajectory: list[TrajectoryStep] = Field(min_length=1, max_length=12)
    final_position: str = Field(min_length=1, max_length=2000)
    reasoning_style: str = Field(min_length=1, max_length=1000)
    open_question: str = Field(max_length=1000)
    # The whole summary in the platform's base language, used only for embeddings (radar).
    normalized_text: str = Field(min_length=1, max_length=8000)


class RadarDimension(Strict):
    name: str = Field(min_length=1, max_length=60)
    low_pole: str = Field(min_length=1, max_length=300)
    high_pole: str = Field(min_length=1, max_length=300)


class RadarAxisName(RadarDimension):
    # Index of the PCA axis this name belongs to, as given in the input.
    axis_index: int = Field(ge=0, le=5)


class RadarAxisNames(Strict):
    """radar_axis_naming output: a name and two pole descriptions per embedding axis."""

    axes: list[RadarAxisName] = Field(min_length=1, max_length=6)

    @model_validator(mode="after")
    def distinct(self) -> "RadarAxisNames":
        if len({a.axis_index for a in self.axes}) != len(self.axes):
            raise ValueError("每個軸只能命名一次")
        return self


class RadarDimensions(Strict):
    """radar_dimensions output (fallback route, fewer than 15 students): 4–6 dimensions."""

    dimensions: list[RadarDimension] = Field(min_length=4, max_length=6)

    @model_validator(mode="after")
    def distinct(self) -> "RadarDimensions":
        # A repeated dimension would be scored as two axes and skew the chart.
        if len({d.name.casefold() for d in self.dimensions}) != len(self.dimensions):
            raise ValueError("維度名稱不可重複")
        return self


class RadarScore(Strict):
    dimension_index: int = Field(ge=0, le=5)
    score: int = Field(ge=0, le=4)
    sources: list[Citation] = Field(max_length=3)


class RadarScores(Strict):
    """radar_scoring output: one student's 0–4 score on each dimension, with citations."""

    scores: list[RadarScore] = Field(min_length=1, max_length=6)

    @model_validator(mode="after")
    def distinct(self) -> "RadarScores":
        if len({s.dimension_index for s in self.scores}) != len(self.scores):
            raise ValueError("每個維度只能評一次")
        return self
