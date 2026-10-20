"""Public contracts of /api/v2/solo: the activity entry, the attempt view and action bodies."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.platform.api.model_base import TrimmedModel
from app.modules.solo_dialogue.domain.solo_types import (
    PrincipleHint,
    QuestionStatus,
    ReviseHint,
    SoloAction,
    SoloNotice,
    SoloState,
    TutorMove,
)


class View(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SoloQuestionProgressView(View):
    index: int
    status: Literal["not_started", "in_dialogue", "confirmed"]
    # Only questions the student has reached carry a title (AGENTS.md: 未進入的階段不回傳 title).
    title: str | None
    # The confirmed option's text; only confirmed questions have one.
    option_label: str | None


class SoloAttemptBrief(View):
    id: str
    state: SoloState
    question_index: int
    progress: list[SoloQuestionProgressView]  # one per question, reached or not
    review_status: Literal["not_started", "in_progress"]
    current_turn: int  # the current question's turn_index


class SoloActivityView(View):
    activity_id: str
    title: str
    course_id: str
    course_name: str
    status: Literal["scheduled", "open", "ended"]
    question_count: int
    ends_at: float
    attempt: SoloAttemptBrief | None  # None until the student starts


class PersonalSummaryView(View):
    current_position: str
    reason_summary: str
    relevant_conditions: list[str]
    unresolved_issue: str
    # Why the reasons sit near principle_hint; empty when there is none (or stored before it).
    principle_note: str = ""


class SoloOptionView(View):
    id: str
    text: str


class SoloStanceView(View):
    option_id: str  # the first choice; never changes
    current_option_id: str  # after 我其實改變想法了; what A2 and 我的選擇 show
    reason: str


class SoloQuestionView(View):
    index: int
    id: str
    title: str
    scenario: str
    options: list[SoloOptionView]
    stance: SoloStanceView | None
    status: QuestionStatus
    confirmed_summary: PersonalSummaryView | None


class SoloMessageView(View):
    id: str
    question_index: int
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
    question_index: int
    question_count: int
    # Only questions the student has reached (index <= question_index).
    questions: list[SoloQuestionView]
    messages: list[SoloMessageView]
    candidate_summary: PersonalSummaryView | None
    summary_digest: str | None
    principle_hint: PrincipleHint | None
    # After 不太對 until the next student message; rejected_summary is the summary turned down.
    revising: bool
    rejected_summary: PersonalSummaryView | None
    notice: SoloNotice | None
    available_actions: list[SoloAction]


class SubmitStanceBody(TrimmedModel):
    option_id: str = Field(min_length=1, max_length=64)
    reason: str = Field(min_length=1, max_length=4000)


class SendMessageBody(TrimmedModel):
    text: str = Field(min_length=1, max_length=4000)
    # Only while revising; changed_mind requires new_option_id, other hints forbid it.
    revise_hint: ReviseHint | None = None
    new_option_id: str | None = Field(default=None, min_length=1, max_length=64)


class ConfirmViewpointBody(TrimmedModel):
    summary_digest: str = Field(min_length=1, max_length=64)


SoloActionBody = SubmitStanceBody | SendMessageBody | ConfirmViewpointBody

# Which body each action takes; actions not listed take none.
ACTION_BODIES: dict[str, type[TrimmedModel]] = {
    "submit_stance": SubmitStanceBody,
    "send_message": SendMessageBody,
    "confirm_viewpoint": ConfirmViewpointBody,
}


# ---- T5: the teacher's live progress (statuses, turn counts and times; never what was written)


class SoloProgressQuestionView(View):
    index: int
    title: str  # the teacher's own question


class SoloProgressSummaryView(View):
    enrolled: int
    started: int
    done: int  # reached the review step
    # Per question: started but not confirmed yet, including those who have not reached it.
    unconfirmed_by_question: list[int]
    attention: int


class SoloProgressCellView(View):
    status: Literal["not_started", "in_dialogue", "confirming", "confirmed"]
    turns: int | None  # in_dialogue only


class SoloStudentProgressView(View):
    enrollment_id: str
    display_name: str
    overall: Literal["not_started", "in_progress", "done"]
    cells: list[SoloProgressCellView]  # one per question
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
    question_count: int
    ends_at: float | None
    generated_at: float
    questions: list[SoloProgressQuestionView]
    summary: SoloProgressSummaryView
    students: list[SoloStudentProgressView]
