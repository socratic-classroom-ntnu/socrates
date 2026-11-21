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


class AIConnectionTestView(BaseModel):
    ok: Literal[True] = True
