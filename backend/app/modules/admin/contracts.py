"""後台 API 的形狀（spec 〈介面〉）。"""

from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.modules.ai_connection.contracts import ModelOption
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


class SystemAIModelsView(BaseModel):
    models: list[ModelOption]
