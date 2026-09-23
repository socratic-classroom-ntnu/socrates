"""Versioned public contracts; source for /api/v2 OpenAPI and generated TypeScript."""

from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Option(Strict):
    id: str = Field(min_length=1, max_length=64)
    text: str = Field(min_length=1, max_length=2000)


class Question(Strict):
    id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=300)
    scenario: str = Field(min_length=1, max_length=12000)
    options: list[Option] = Field(min_length=2)
    duration_seconds: int = Field(default=90, ge=1)
    argument_required: bool = True
    tutor_goal: str = "協助學生照見自己的立場與理由。"
    probe_hints: list[str] = Field(
        default_factory=lambda: ["你採用的原則是什麼？條件改變時，你會如何判斷？"]
    )
    max_focus_turns: int = Field(default=3, ge=1)
    focus_response_seconds: int = Field(default=90, ge=5)
    sender_point_cap: int = Field(default=5, ge=0)
    receiver_point_cap: int = Field(default=25, ge=0)

    @model_validator(mode="after")
    def distinct(self):
        if len({o.id for o in self.options}) != len(self.options):
            raise ValueError("選項 id 請各自唯一")
        return self


class ScriptDocument(Strict):
    title: str = Field(min_length=1, max_length=300)
    mode: Literal["static", "dynamic"] = "static"
    questions: list[Question] = Field(min_length=1)
    max_questions: int = Field(default=3, ge=1)
    preview_seconds: int = Field(default=8, ge=5, le=10)
    live_llm_call_budget: int = Field(default=30, ge=0)

    @model_validator(mode="after")
    def ids(self):
        if len({q.id for q in self.questions}) != len(self.questions):
            raise ValueError("題目 id 請各自唯一")
        return self


class Register(Strict):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[\w.-]+$")
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=12, max_length=256)

    @field_validator("email")
    @classmethod
    def email_shape(cls, v: str) -> str:
        v = v.strip().casefold()
        if "@" not in v or "." not in v.rsplit("@", 1)[1]:
            raise ValueError("請填入可收信的 email")
        return v


class Login(Strict):
    login: str
    password: str


class MailRequest(Strict):
    email: str


class TokenRequest(Strict):
    token: str


class ResetRequest(TokenRequest):
    password: str = Field(min_length=12, max_length=256)


class AccountView(Strict):
    id: str
    username: str
    email: str
    verified: bool
    csrf_token: str
    points: int
    achievements: list[str]


class ScriptSave(Strict):
    document: ScriptDocument
    expected_revision: int | None = None


class CreateRoom(Strict):
    script_id: str


class JoinRoom(Strict):
    code: str
    alias: str = Field(min_length=1, max_length=40)
    avatar: str = "scholar"


class Command(Strict):
    action_id: str = Field(min_length=8, max_length=100)
    kind: Literal[
        "start",
        "draft",
        "answer",
        "barrage",
        "focus_message",
        "next",
        "approve_question",
        "regenerate_question",
        "personal_summary",
    ]
    data: dict[str, Any] = Field(default_factory=dict)


class Reaction(Strict):
    action_id: str = Field(min_length=8, max_length=100)
    kind: Literal["heart", "like", "gift"]
    focus_id: str
    turn_index: int = Field(ge=0)


class Observations(Strict):
    has_position: bool = False
    has_reason: bool = False
    reason_tested: bool = False
    position_shifted: bool = False
    principle_label: Literal["後果主義", "義務論", "混合", "未明"] = "未明"


class TutorTurn(Strict):
    reply_text: str = Field(min_length=1, max_length=16000)
    observations: Observations
    move: Literal["probe", "clarify", "challenge", "reflect", "summarize"] = "probe"
    micro_summary: str = ""


class SummaryResult(Strict):
    text: str = Field(min_length=1, max_length=20000)
    key_points: list[str] = Field(default_factory=list)


class DynamicResult(Strict):
    question: Question


class MemberView(Strict):
    id: str
    alias: str
    avatar: str
    seat: int
    online: bool
    points: int
    achievements: list[str]
    username: str | None = None


class RoomView(Strict):
    id: str
    code: str | None
    title: str
    role: Literal["teacher", "student"]
    member_id: str | None
    phase: str
    seq: int
    server_now: float
    deadline_at: float | None
    question: Question | None
    question_index: int
    question_run_id: str | None
    question_count: int
    members: list[MemberView]
    my_draft: dict[str, Any] | None
    my_answer: dict[str, Any] | None
    distribution: list[dict[str, Any]]
    focus: dict[str, Any] | None
    transcript: list[dict[str, Any]]
    preview: Question | None
    summaries: dict[str, Any]
    available_actions: list[str]
    source_mode: str
    last_error: str | None
