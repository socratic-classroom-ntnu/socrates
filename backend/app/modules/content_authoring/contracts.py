"""Public contracts owned by Content Authoring."""

from typing import Any, Literal
from pydantic import Field, field_validator, model_serializer, model_validator
from app.modules.llm_runtime.contracts import (
    Option as Option,
    PublicQuestion as PublicQuestion,
    ScriptAssistResult as ScriptAssistResult,
)
from app.modules.platform.contracts import Strict


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
    def _omit_unset_scenario_ai(self, handler: Any) -> Any:
        value = handler(self)
        if value.get("scenario_ai") is None:
            value.pop("scenario_ai", None)
        return value


def public_question(question: dict[str, Any] | None) -> dict[str, Any] | None:
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
    def ids(self) -> "ScriptDocument":
        if len({q.id for q in self.questions}) != len(self.questions):
            raise ValueError("題目 id 請各自唯一")
        return self


class ScriptSave(Strict):
    document: ScriptDocument
    expected_revision: int | None = None


class ScriptView(Strict):
    """GET /scripts 的一列：劇本本體照存檔原樣回傳（舊版劇本不因新欄位驗證而讀不到）。"""

    id: str
    revision: int
    document: dict[str, Any]


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
