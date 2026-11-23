"""後台 API 的形狀（spec 〈介面〉）。"""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field

from app.modules.platform.model_base import TrimmedModel


class ToggleView(BaseModel):
    key: str
    name: str
    description: str
    enabled: bool
    # Null until an admin changes the switch (spec P25).
    updated_at: float | None
    updated_by_name: str | None
    # Asked before turning the switch off; null = no confirmation (spec P35).
    disable_warning: str | None


class ToggleUpdate(TrimmedModel):
    enabled: bool


class AdminView(BaseModel):
    account_id: str
    username: str
    display_name: str
    account_role: str
    is_you: bool


class AdminCreate(TrimmedModel):
    username: str


class SystemAIInput(BaseModel):
    """The 系統 AI form (spec 〈介面〉). No length or format limits here: a rejected value would be
    echoed back in FastAPI's 422, and the key must never be (spec P37). `admin.system_ai`
    checks every field and answers with an error code only."""

    adapter: str
    model: str
    api_key: str | None = None
    base_url: str | None = None


class SystemAITestView(BaseModel):
    ok: Literal[True] = True


class AdminAuthor(BaseModel):
    kind: Literal["admin"] = "admin"
    name: str


class DeployAuthor(BaseModel):
    """Imported from SOCRATES_PRACTICE_LLM_* at startup; no admin has changed it since (P31)."""

    kind: Literal["deploy"] = "deploy"


class SystemAIView(BaseModel):
    # A usable connection: present, enabled, key decrypts (spec P30). False → the rest is null.
    configured: bool
    adapter: str | None
    model: str | None
    base_url: str | None
    key_last4: str | None
    updated_at: float | None
    updated_by: Annotated[AdminAuthor | DeployAuthor, Field(discriminator="kind")] | None
    fallback_enabled: bool


class SystemAIModelsInput(BaseModel):
    """Where to list models from (spec P40); like SystemAIInput, unchecked here."""

    adapter: str
    api_key: str | None = None
    base_url: str | None = None


class ModelOption(BaseModel):
    id: str
    name: str
    # OpenRouter only (from the id's prefix); other services: null, the page shows the service.
    provider: str | None
    # OpenRouter free models: listed, but marked as likely rate-limited (spec P40).
    free: bool


class SystemAIModelsView(BaseModel):
    models: list[ModelOption]


# ---- 報表：QA 在網站上照題單作答後，從後台紀錄算出的評測與語音用量 ----


class EvalCaseView(BaseModel):
    """One case of the eval set, with what the recorded runs of it scored (0–1; null = unmeasured)."""

    id: str
    category: str
    # What the student types, in order, each as its own message.
    messages: list[str]
    # The site language the case expects the student to have chosen.
    locale: str
    runs: int
    schema_: float | None = Field(alias="schema", serialization_alias="schema")
    move: float | None
    flags: float | None
    check: float | None
    language: float | None
    leaked: int
    notes: list[str]

    model_config = {"populate_by_name": True}


class EvalMeasureView(BaseModel):
    key: Literal["schema", "flags", "move", "check", "language", "citations"]
    rate: float | None
    count: int


class EvalReportView(BaseModel):
    scenario: str
    tutor_goal: str
    days: int
    runs: int
    leaked: int
    totals: list[EvalMeasureView]
    cases: list[EvalCaseView]


class VoiceSessionView(BaseModel):
    at: float
    username: str | None
    endpoint: str
    model: str | None
    input_tokens: int
    output_tokens: int
    audio_input_tokens: int
    audio_output_tokens: int
    # Null when no rate is set (voice) or the call recorded none (the confirmation judge).
    cost: float | None


class VoiceTotalsView(BaseModel):
    sessions: int
    input_tokens: int
    output_tokens: int
    cost: float | None


class VoiceReportView(BaseModel):
    days: int
    # Whether VOICE_INPUT_COST_PER_MILLION and VOICE_OUTPUT_COST_PER_MILLION are both set.
    costed: bool
    sessions: list[VoiceSessionView]
    totals: VoiceTotalsView


class InteractionCountView(BaseModel):
    kind: Literal["request", "model"]
    name: str
    count: int
    last_at: float


class InteractionLogView(BaseModel):
    """後台「分析紀錄」的摘要：每一種操作／模型程式各幾筆；完整紀錄用 export 下載。"""

    days: int
    enabled: bool
    total: int
    # How many different de-identified people the records come from.
    subjects: int
    counts: list[InteractionCountView]


class InteractionRecordView(BaseModel):
    at: float
    kind: Literal["request", "model"]
    name: str
    subject: str | None
    outcome: str
    latency_ms: int | None
    data: dict[str, Any]


class InteractionExportView(BaseModel):
    """Every record in the range, oldest first; the page saves them as JSON Lines."""

    days: int
    records: list[InteractionRecordView]
