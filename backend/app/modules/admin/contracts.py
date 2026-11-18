"""後台 API 的形狀（spec 〈介面〉）。"""

from pydantic import BaseModel

from app.modules.platform.model_base import TrimmedModel


class ToggleView(BaseModel):
    key: str
    name: str
    description: str
    enabled: bool
    # Null until an admin changes the switch (spec P25).
    updated_at: float | None
    updated_by_name: str | None


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
