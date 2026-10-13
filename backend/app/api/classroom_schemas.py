"""Versioned public contracts; source for /api/v2 OpenAPI and generated TypeScript."""

from typing import Annotated, Any, Literal
from pydantic import (
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_serializer,
    model_validator,
)

from pydantic_core import PydanticCustomError

from app.api.model_base import TrimmedModel


class Strict(TrimmedModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Option(Strict):
    id: str = Field(min_length=1, max_length=64)
    text: str = Field(min_length=1, max_length=2000)


class ScenarioAI(Strict):
    """Teacher-only routing for one question's LLM jobs; owner scope is checked against the DB."""

    provider_profile_id: str = Field(min_length=1, max_length=36)
    model: str = Field(min_length=1, max_length=200)

    @field_validator("provider_profile_id", "model")
    @classmethod
    def trimmed(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("請選擇這一題要使用的 AI 連線與模型")
        return value


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
    def distinct(self):
        if len({o.id for o in self.options}) != len(self.options):
            raise ValueError("選項 id 請各自唯一")
        return self


class SampleQuestionDraft(PublicQuestion):
    """A repository sample before teacher-authored options make it a valid saved Question."""

    options: list[Option] = Field(default_factory=list)


class SampleQuestionSet(Strict):
    title: str
    questions: list[SampleQuestionDraft]


class Question(PublicQuestion):
    # Optional per-question model override; absent means 沿用課堂設定.
    scenario_ai: ScenarioAI | None = None

    @model_serializer(mode="wrap")
    def _omit_unset_scenario_ai(self, handler):
        value = handler(self)
        if value.get("scenario_ai") is None:
            value.pop("scenario_ai", None)
        return value


def public_question(question: dict | None) -> dict | None:
    """Copy of a stored question without teacher-only fields, for student/LLM projections."""
    if question is None:
        return None
    value = dict(question)
    value.pop("scenario_ai", None)
    return value


class ScriptDocument(Strict):
    title: str = Field(min_length=1, max_length=300)
    mode: Literal["static", "dynamic"] = "static"
    questions: list[Question] = Field(min_length=1)
    max_questions: int = Field(default=3, ge=1)
    preview_seconds: int = Field(default=8, ge=5, le=10)
    live_llm_call_budget: int = Field(default=240, ge=0)

    @model_validator(mode="after")
    def ids(self):
        if len({q.id for q in self.questions}) != len(self.questions):
            raise ValueError("題目 id 請各自唯一")
        return self


# 帳號名：3–32 個字元，英文字母開頭、英文字母或數字結尾，中間可用英數、底線、點、連字號。
USERNAME_PATTERN = r"^[A-Za-z][A-Za-z0-9_.-]*[A-Za-z0-9]$"
# 密碼：8–32 個字元，需有大寫、小寫、數字與特殊字元；特殊字元只允許下列這些（不含引號、反斜線、
# 分號、角括號、空白等）。只套用在設定新密碼（註冊、重設）；登入不檢查格式，舊帳號照常登入。
PASSWORD_SPECIALS = "!@#$%^&*_-+=.?~"
PASSWORD_MIN, PASSWORD_MAX = 8, 32  # Register／ResetRequest 的 Field 寫同樣的數字（前端測試逐字比對）
PASSWORD_RULE = (
    f"密碼需 {PASSWORD_MIN}–{PASSWORD_MAX} 個字元，並包含大寫字母、小寫字母、數字與特殊字元"
    f"（可用 {' '.join(PASSWORD_SPECIALS)}），不能有空白或其他符號。"
)


def password_policy(value: str) -> str:
    allowed = set(PASSWORD_SPECIALS)
    ok = (
        all((c.isascii() and c.isalnum()) or c in allowed for c in value)
        and any(c.isascii() and c.isupper() for c in value)
        and any(c.isascii() and c.islower() for c in value)
        and any(c.isdigit() and c.isascii() for c in value)
        and any(c in allowed for c in value)
    )
    if not ok:
        raise PydanticCustomError("password_policy", PASSWORD_RULE)
    return value


class Register(Strict):
    username: str = Field(min_length=3, max_length=32, pattern=USERNAME_PATTERN)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=32)

    @field_validator("password")
    @classmethod
    def password_rule(cls, v: str) -> str:
        return password_policy(v)

    @field_validator("email")
    @classmethod
    def email_shape(cls, v: str) -> str:
        v = v.strip().casefold()
        if "@" not in v or "." not in v.rsplit("@", 1)[1]:
            raise ValueError("請填入可收信的 email")
        return v


class Login(Strict):
    login: str = Field(max_length=254)
    password: str = Field(max_length=256)


class MailRequest(Strict):
    email: str = Field(max_length=254)


class TokenRequest(Strict):
    token: str = Field(max_length=512)


class ResetRequest(TokenRequest):
    password: str = Field(min_length=8, max_length=32)

    @field_validator("password")
    @classmethod
    def password_rule(cls, v: str) -> str:
        return password_policy(v)


class VerificationDelivery(Strict):
    mail_id: str
    delivery_state: str
    expires_at: float


class AccountView(Strict):
    id: str
    username: str
    email: str
    email_masked: str = ""
    verified: bool
    authority_state: Literal["EMAIL_VERIFICATION", "FULL_PRODUCT"] = "EMAIL_VERIFICATION"
    verification_delivery: VerificationDelivery | None = None
    csrf_token: str
    points: int
    achievements: list[str]


class ScriptSave(Strict):
    document: ScriptDocument
    expected_revision: int | None = None


class ScriptView(Strict):
    """GET /scripts 的一列：劇本本體照存檔原樣回傳（舊版劇本不因新欄位驗證而讀不到）。"""

    id: str
    revision: int
    document: dict[str, Any]


class CreateRoom(Strict):
    script_id: str = Field(max_length=36)


class JoinRoom(Strict):
    # 空白或全是空格的代碼在驗證層就擋下（422），不會被當成「找不到課程」。
    code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]
    alias: str = Field(min_length=1, max_length=40)
    avatar: str = Field(default="scholar", max_length=120)


class Command(Strict):
    action_id: str = Field(min_length=8, max_length=100)
    kind: Literal[
        "start",
        "draft",
        "answer",
        "barrage",
        "focus_message",
        "next",
        "end",
        "approve_question",
        "regenerate_question",
        "personal_summary",
    ]
    data: dict[str, Any] = Field(default_factory=dict)


class Reaction(Strict):
    action_id: str = Field(min_length=8, max_length=100)
    kind: Literal["heart", "like", "gift"]
    focus_id: str = Field(max_length=64)
    turn_index: int = Field(ge=0)


class Observations(Strict):
    # Every field is required: a reply that omits one is a failed reply, not "not met"
    # (design spec §13.2 layer 3).
    has_position: bool
    has_reason: bool
    reason_tested: bool
    position_shifted: bool
    principle_label: Literal["後果主義", "義務論", "混合", "未明"]


class TutorTurn(Strict):
    reply_text: str = Field(min_length=1, max_length=16000)
    observations: Observations
    move: Literal["probe", "clarify", "challenge", "reflect", "summarize"] = "probe"
    micro_summary: str = ""


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


class SummaryResult(Strict):
    text: str = Field(min_length=1, max_length=20000)
    key_points: list[str] = Field(default_factory=list)


class DynamicResult(Strict):
    # Generated questions never carry routing; the teacher sets scenario_ai in the script.
    question: PublicQuestion


# AI 學生的輸出契約
class LLMStudentTurn(Strict):
    action_mode: Literal["answer", "focus", "viewpoint", "final_reflection"]
    option_id: str = ""
    text: str = Field(min_length=1, max_length=12000)
    relation: Literal["supports", "challenges", "qualifies", "revises"] = "qualifies"
    should_confirm: bool = True


class OtherSuggestionResult(Strict):
    suggestion_text: str = Field(min_length=1, max_length=1000)


class LibraryClassroomView(Strict):
    """One row of GET /library/classrooms: a teacher's long-lived Classroom asset."""

    id: str
    title: str
    revision: int


class ScriptAssistRequest(Strict):
    """Teacher's AI-assisted design request against the draft currently in the editor."""

    request: str = Field(min_length=1, max_length=4000)
    document: dict[str, Any] = Field(default_factory=dict)
    question_index: int | None = Field(default=None, ge=0)
    script_id: str | None = Field(default=None, max_length=36)


class ScriptAssistResult(Strict):
    """LLM output for ai_script_authoring; the server turns it into a full Question."""

    title: str = Field(min_length=1, max_length=300)
    scenario: str = Field(min_length=1, max_length=12000)
    options: list[str] = Field(min_length=2, max_length=4)
    tutor_goal: str = Field(min_length=1, max_length=2000)
    probe_hints: list[str] = Field(min_length=1, max_length=6)
    rationale: str = Field(max_length=2000)


class MemberView(Strict):
    id: str
    alias: str
    avatar: str
    seat: int
    online: bool
    points: int
    achievements: list[str]
    username: str | None = None
    actor_type: Literal["human", "llm_student"] = "human"
    persona_id: str | None = None


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
    question: PublicQuestion | None
    question_index: int
    question_run_id: str | None
    question_count: int
    members: list[MemberView]
    my_draft: dict[str, Any] | None
    my_answer: dict[str, Any] | None
    distribution: list[dict[str, Any]]
    focus: dict[str, Any] | None
    transcript: list[dict[str, Any]]
    preview: PublicQuestion | None
    summaries: dict[str, Any]
    available_actions: list[str]
    source_mode: str
    last_error: str | None
