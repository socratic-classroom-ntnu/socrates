from typing import Literal

from pydantic import BaseModel


class ModelOption(BaseModel):
    id: str
    name: str
    # OpenRouter only (from the id's prefix); other services: null, the page shows the service.
    provider: str | None
    # OpenRouter free models: listed, but marked as likely rate-limited (spec P40).
    free: bool


class SystemOptionView(BaseModel):
    # The 後台 switch is on and the 系統 AI is set up (saved, enabled, key decrypts).
    available: bool
    # The 系統 AI's model while it is set up, even with the switch off; null when it is not.
    model: str | None


class OwnConnectionView(BaseModel):
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


class ConnectionView(BaseModel):
    # "own" while the teacher's connection is enabled; otherwise "system", usable or not.
    mode: Literal["system", "own"]
    system: SystemOptionView
    own: OwnConnectionView | None
