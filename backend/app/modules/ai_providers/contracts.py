from __future__ import annotations
from typing import Annotated, Any, Literal
from pydantic import Field, StringConstraints, field_validator
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
