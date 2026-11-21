from typing import Literal

from pydantic import BaseModel


class ModelOption(BaseModel):
    id: str
    name: str
    # OpenRouter only (from the id's prefix); other services: null, the page shows the service.
    provider: str | None
    # OpenRouter free models: listed, but marked as likely rate-limited (spec P40).
    free: bool


class AIConnectionSystemView(BaseModel):
    # The 後台 switch is on and the 系統 AI is set up (saved, enabled, key decrypts).
    available: bool
    # The 系統 AI's model while it is set up, even with the switch off; null when it is not.
    model: str | None


class AIConnectionOwnView(BaseModel):
    """The teacher's one connection. Never the key: only its last four characters."""

    adapter: str
    model: str
    base_url: str | None
    name: str
    key_last4: str | None
    # False = the teacher chose 系統提供 and the key is kept for switching back.
    enabled: bool
    # False = 金鑰已失效: a student's dialogue cannot use it (gone, or no longer decrypts).
    key_usable: bool


class AIConnectionView(BaseModel):
    # "own" while the teacher's connection is enabled; otherwise "system", usable or not.
    mode: Literal["system", "own"]
    system: AIConnectionSystemView
    own: AIConnectionOwnView | None


class AIConnectionInput(BaseModel):
    """The form. No length or format limits here: a rejected value would be echoed back in
    FastAPI's 422, and the key must never be (classroom_app leaves `input` out on this path).
    `ai_connection.connection` checks every field and answers with an error code only."""

    adapter: str
    model: str
    # Blank = keep the saved key, only for the same service at the same address.
    api_key: str | None = None
    base_url: str | None = None
    # Blank = the service's name (a number added when the teacher already has one).
    name: str | None = None


class AIConnectionModeInput(BaseModel):
    # "system" = 系統提供 (the connection disabled, its key kept); "own" = that connection back on.
    mode: Literal["system", "own"]


class AIConnectionTestView(BaseModel):
    ok: Literal[True] = True


class AIConnectionModelsInput(BaseModel):
    """Where to list models from; unchecked here for the same reason as AIConnectionInput."""

    adapter: str
    # Blank = the saved key, only for the same service at the same address.
    api_key: str | None = None
    base_url: str | None = None


class AIConnectionModelsView(BaseModel):
    models: list[ModelOption]


class AIConnectionUsageView(BaseModel):
    """我的用量, in US dollars, for the teacher's connection in use (需求〈我的用量〉).

    status: "ok" (OpenRouter answered), "unsupported" (the service cannot be asked), "failed"
    (the query failed or timed out; nothing about the connection changed), "none" (no own
    connection in use with a usable key: the page shows no usage)."""

    status: Literal["ok", "unsupported", "failed", "none"]
    adapter: str | None
    # With a limit: limit − remaining; without one: everything the key has used.
    used: float | None
    limit: float | None
    # May be 0 or below: nothing left.
    remaining: float | None
    limit_reset: Literal["daily", "weekly", "monthly"] | None
