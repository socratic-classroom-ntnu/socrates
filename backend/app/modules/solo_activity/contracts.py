"""Public contracts of /api/v2/solo: the state machine's names, the activity entry, the attempt
view, action bodies, and the teacher's progress and statistics views.

A student answers each scenario in their own words and walks a sequence of scenarios whose length
is not fixed when the attempt starts, so no view carries a scenario count ahead of time.

The Literals list every state and action in the design spec's §4.5 table; states and actions
not implemented yet are part of the type but never produced.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.platform.model_base import TrimmedModel

SoloState = Literal[
    "answering",
    "awaiting_tutor",
    "tutor_unavailable",
    "in_dialogue",
    "confirming",
    "between_scenarios",
    "reviewing",
    "awaiting_reflection_prompt",
    "reflecting",
    "budget_exhausted",
    "completed",
]
SoloAction = Literal[
    "send_message",
    "retry",
    "confirm_viewpoint",
    "revise_viewpoint",
    "next_scenario",
    "submit_review",
    "retry_reflection_prompt",
    "continue_reflection",
    "submit_reflection",
    "continue_without_tutor",
]
SoloNotice = Literal["tutor_unavailable", "owner_provider_missing"]
ScenarioStatus = Literal["in_progress", "goal_met"]
PrincipleHint = Literal["後果主義", "義務論", "混合"]
TutorMove = Literal["probe", "clarify", "challenge", "reflect", "summarize", "hypothetical"]
# Which part of a turned-down summary the student says is wrong.
ReviseHint = Literal["stance", "reason", "condition", "changed_mind"]


class View(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SoloScenarioProgressView(View):
    index: int
    status: Literal["in_dialogue", "confirmed"]


class SoloAttemptBrief(View):
    id: str
    state: SoloState
    scenario_index: int
    progress: list[SoloScenarioProgressView]  # one per scenario of the sequence so far
    review_status: Literal["not_started", "in_progress"]
    current_turn: int  # the current scenario's turn_index


class SoloActivityView(View):
    activity_id: str
    title: str
    course_id: str
    course_name: str
    status: Literal["scheduled", "open", "ended"]
    ends_at: float
    attempt: SoloAttemptBrief | None  # None until the student starts


class CitationSourceView(View):
    """One exact quote from a student message, located at its first exact occurrence.

    Offsets index the exact ``SoloMessageView.text`` returned by the API. They are not Unicode
    code-point or grapheme-cluster offsets.
    """

    message_id: str = Field(
        min_length=1,
        description="ID of the student message whose exact text contains quote.",
    )
    quote: str = Field(
        min_length=1,
        max_length=500,
        description="Exact, unnormalised substring of the referenced SoloMessageView.text.",
    )
    start: int = Field(
        ge=0,
        description=(
            "Zero-based inclusive offset in UTF-16 code units to quote's first exact occurrence "
            "in SoloMessageView.text."
        ),
    )
    end: int = Field(
        ge=1,
        description=(
            "Zero-based exclusive offset in UTF-16 code units into SoloMessageView.text; "
            "text.slice(start, end) equals quote."
        ),
    )


RadarDimensionSource = Literal["embedding", "llm"]


class RadarDimensionView(View):
    index: int = Field(ge=0, le=5)
    name: str = Field(min_length=1, max_length=60)
    low_pole: str = Field(min_length=1, max_length=300)
    high_pole: str = Field(min_length=1, max_length=300)
    source: RadarDimensionSource


class RadarScoreView(View):
    dimension_index: int = Field(ge=0, le=5)
    score: float = Field(ge=0, le=4)
    sources: list[CitationSourceView] = Field(max_length=3)


class RadarStudentView(View):
    # Opaque within this payload: enrollment id for solo, scoped pseudonym for group analytics.
    student_id: str = Field(min_length=1)
    display_name: str = Field(min_length=1, max_length=64)
    scores: list[RadarScoreView] = Field(min_length=1, max_length=6)


class RadarView(View):
    dimensions: list[RadarDimensionView] = Field(min_length=1, max_length=6)
    students: list[RadarStudentView] = Field(min_length=1)

    @model_validator(mode="after")
    def aligned(self) -> "RadarView":
        indices = [dimension.index for dimension in self.dimensions]
        if indices != list(range(len(self.dimensions))):
            raise ValueError("雷達維度必須從 0 開始連續排列")
        student_ids = [student.student_id for student in self.students]
        if len(set(student_ids)) != len(student_ids):
            raise ValueError("雷達學生 id 不可重複")
        if any(
            [score.dimension_index for score in student.scores] != indices
            for student in self.students
        ):
            raise ValueError("每位學生必須依序包含每個雷達維度的分數")
        return self


class RadarDimensionUpdate(TrimmedModel):
    name: str = Field(min_length=1, max_length=60)


class PersonalSummaryView(View):
    current_position: str
    reason_summary: str
    relevant_conditions: list[str]
    unresolved_issue: str
    # Why the reasons sit near principle_hint; empty when there is none (or stored before it).
    principle_note: str = ""
    # Empty until llm-runtime hands solo-activity validated, located citations.
    sources: list[CitationSourceView] = Field(default_factory=list)


class SoloScenarioChangeView(View):
    """The one condition a written scenario changed, shown as before → after."""

    condition: str
    before: str
    after: str


class SoloScenarioView(View):
    index: int
    id: str
    text: str  # the scenario as the teacher or the scenario writer wrote it, verbatim
    # None for the teacher's own first scenario; what the written ones changed.
    change: SoloScenarioChangeView | None
    answer: str | None  # the student's first answer; None until given
    status: ScenarioStatus
    confirmed_summary: PersonalSummaryView | None


class SoloMessageView(View):
    id: str
    scenario_index: int  # the scenario this message belongs to
    role: Literal["student", "tutor"]
    text: str
    created_at: float
    move: TutorMove | None  # tutor messages only
    revise_hint: ReviseHint | None  # student messages only


class SoloAttemptView(View):
    id: str
    activity_id: str
    activity_title: str
    course_id: str
    course_name: str
    display_name: str
    state: SoloState
    scenario_index: int
    # Only scenarios the student has reached (index <= scenario_index).
    scenarios: list[SoloScenarioView]
    messages: list[SoloMessageView]
    candidate_summary: PersonalSummaryView | None
    summary_digest: str | None
    principle_hint: PrincipleHint | None
    # After 不太對 until the next student message; rejected_summary is the summary turned down.
    revising: bool
    rejected_summary: PersonalSummaryView | None
    notice: SoloNotice | None
    available_actions: list[SoloAction]


class SendMessageBody(TrimmedModel):
    # The first message of a scenario is the student's answer; later ones continue the dialogue.
    text: str = Field(min_length=1, max_length=4000)
    # Only while revising: which part of the turned-down summary was wrong.
    revise_hint: ReviseHint | None = None


class ConfirmViewpointBody(TrimmedModel):
    summary_digest: str = Field(min_length=1, max_length=64)


SoloActionBody = SendMessageBody | ConfirmViewpointBody

# Which body each action takes; actions not listed take none.
ACTION_BODIES: dict[str, type[TrimmedModel]] = {
    "send_message": SendMessageBody,
    "confirm_viewpoint": ConfirmViewpointBody,
}


# ---- T5: the teacher's live progress (statuses, turn counts and times; never what was written)


class SoloProgressSummaryView(View):
    enrolled: int
    started: int
    done: int  # reached the review step
    attention: int


class SoloProgressCellView(View):
    status: Literal["answering", "in_dialogue", "confirming", "confirmed"]
    turns: int | None  # in_dialogue only


class SoloStudentProgressView(View):
    enrollment_id: str
    display_name: str
    overall: Literal["not_started", "in_progress", "done"]
    cells: list[SoloProgressCellView]  # one per scenario of this student's sequence so far
    review_status: Literal["not_started", "in_progress"]
    # The later of the last message and the attempt's last update; None before starting.
    last_activity_at: float | None
    attention: bool  # in progress and idle for over ATTENTION_SECONDS


class SoloActivityProgressView(View):
    activity_id: str
    title: str
    course_id: str
    course_name: str
    status: Literal["draft", "scheduled", "open", "ended"]
    ends_at: float | None
    generated_at: float
    summary: SoloProgressSummaryView
    students: list[SoloStudentProgressView]


# ---- T6: the teacher's statistics (the confirmed viewpoint's three fields; nothing else written)


class SoloAnalysisSummaryView(View):
    enrolled: int
    started: int
    done: int  # reached the review step, the same definition as T5
    in_progress: int  # started - done


class SoloAnalysisStudentView(View):
    enrollment_id: str
    display_name: str
    confirmed_scenarios: int  # scenarios whose summary the student confirmed
    # From the latest confirmed summary; empty before the first confirmation.
    current_position: str
    reason_summary: str
    relevant_conditions: list[str]


class SoloActivityAnalysisView(View):
    activity_id: str
    title: str
    course_id: str
    course_name: str
    status: Literal["draft", "scheduled", "open", "ended"]
    ends_at: float | None
    generated_at: float
    revision_id: str | None  # the ActivityRevision these numbers belong to; None for a draft
    summary: SoloAnalysisSummaryView
    students: list[SoloAnalysisStudentView]  # every student who started, in enrollment order
