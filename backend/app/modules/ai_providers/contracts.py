from __future__ import annotations
from typing import Annotated, Any, Literal
from pydantic import Field, StringConstraints, field_validator
from app.modules.platform.contracts import Strict
from app.modules.platform.model_base import TrimmedModel


ADAPTERS = frozenset(
    {
        "openrouter",
        "openai",
        "anthropic",
        "gemini",
        "openai-compatible",
    }
)


# 從網頁複製金鑰時常夾帶的零寬字元：去掉後再檢查
_ZERO_WIDTH = dict.fromkeys(map(ord, "\u200b\u200c\u200d\u2060\ufeff"))


def clean_credential(value: str | None) -> str | None:
    """API 金鑰只會是可見的 ASCII 字元；夾帶引號、全形字或空白時直接退回，不送去供應商換一個 401。"""
    if value is None:
        return None
    value = value.translate(_ZERO_WIDTH).strip()
    if not value or any(not ("!" <= ch <= "~") or ch in "\"'`" for ch in value):
        raise ValueError("PROVIDER_CREDENTIAL_MALFORMED")
    return value


class CreateProfile(TrimmedModel):
    name: str = Field(min_length=1, max_length=100)
    adapter: str = Field(max_length=40)
    base_url: str | None = Field(default=None, max_length=500)
    organization: str | None = Field(default=None, max_length=200)
    project: str | None = Field(default=None, max_length=200)
    default_model: str = Field(min_length=1, max_length=200)
    credential_mode: Literal["PERSISTENT", "SESSION"] = "PERSISTENT"
    credential: str | None = Field(default=None, min_length=1, max_length=20000)

    @field_validator("adapter")
    @classmethod
    def valid_adapter(cls, value: str) -> str:
        value = value.strip().casefold()
        if value not in ADAPTERS:
            raise ValueError("PROVIDER_ADAPTER_REQUIRED")
        return value

    @field_validator("credential")
    @classmethod
    def valid_credential(cls, value: str | None) -> str | None:
        return clean_credential(value)


class UpdateProfile(TrimmedModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    base_url: str | None = Field(default=None, max_length=500)
    organization: str | None = Field(default=None, max_length=200)
    project: str | None = Field(default=None, max_length=200)
    default_model: str | None = Field(default=None, min_length=1, max_length=200)
    enabled: bool | None = None


class CredentialUpdate(TrimmedModel):
    credential: str = Field(min_length=1, max_length=20000)
    credential_mode: Literal["PERSISTENT", "SESSION"]

    @field_validator("credential")
    @classmethod
    def valid_credential(cls, value: str) -> str:
        cleaned = clean_credential(value)
        assert cleaned is not None
        return cleaned


class SettingsUpdate(TrimmedModel):
    default_profile_id: str | None = Field(default=None, max_length=36)
    fallback_profile_id: str | None = Field(default=None, max_length=36)
    model_matrix: dict[
        Annotated[str, StringConstraints(max_length=64)],
        Annotated[str, StringConstraints(max_length=200)],
    ] = Field(default_factory=dict, max_length=32)
    budgets: dict[str, Any] = Field(default_factory=dict, max_length=32)
    active_room_id: str | None = Field(default=None, max_length=36)


# --- Response views (what the routes return) ---


class ProfileView(Strict):
    """A provider profile as its owner sees it; the credential itself never leaves the server."""

    id: str
    name: str
    adapter: str
    base_url: str | None
    organization: str | None
    project: str | None
    default_model: str
    credential_mode: Literal["PERSISTENT", "SESSION"]
    has_credential: bool
    secret_last4: str | None
    enabled: bool
    metadata: dict[str, Any]
    updated_at: float


class ProfileDeletedView(Strict):
    status: Literal["DELETED"]
    profile_id: str


class DiscoveredModel(Strict):
    """One model a provider lists. pricing is the provider's own shape, and only OpenAI-style
    listings send it; the routes exclude unset fields, so it stays absent rather than null."""

    id: str
    name: str | None
    pricing: Any = None
    supported_parameters: list[str]
    structured_outputs: bool | None
    reasoning: dict[str, Any] | None


class ModelDiscoveryView(Strict):
    provider_profile_id: str
    adapter: str
    models: list[DiscoveredModel]
    manual_model_id_allowed: bool
    observed_at: float


class ConnectionTestView(Strict):
    status: Literal["READY"]
    provider_profile_id: str
    adapter: str
    model_count: int
    # The first ten models, enough to show the key works.
    sample: list[DiscoveredModel]
    observed_at: float


class AISettingsView(Strict):
    default_profile_id: str | None
    fallback_profile_id: str | None
    model_matrix: dict[str, str]
    budgets: dict[str, Any]
    revision: int


class RevisionView(Strict):
    """GET /meta/revision: which build is running, for support and deploy checks."""

    # "schema" would shadow a BaseModel attribute, so the field is renamed and keeps its wire name.
    schema_id: str = Field(alias="schema")
    source_sha: str
    worktree_sha256: str
    environment: str
    feature_revision: int
    provider_profiles: bool
    classroom_owner_routing: bool
    observed_at: float
