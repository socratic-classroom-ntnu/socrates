"""Shared Pydantic contract base for backend modules."""

from typing import Literal

from pydantic import ConfigDict
from app.modules.platform.model_base import TrimmedModel

from pydantic import BaseModel


class Strict(TrimmedModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class DemoAccountView(BaseModel):
    username: str
    role: Literal["teacher", "student"]


class DemoLoginView(BaseModel):
    """測試帳號的快速登入；只在 seed 過的環境出現（app/modules/platform/demo.py）。"""

    password: str
    accounts: list[DemoAccountView]


class FeaturesView(BaseModel):
    """後台的功能開關目前的狀態（spec P9）。"""

    group_mode: bool
    # Switched on in the 後台 and the voice key set: the solo dialogue shows the voice entry.
    voice_mode: bool = False


class PublicConfigView(BaseModel):
    google_cse_id: str
    search_scope: str
    search_state: str
    debug_mode: bool
    demo_login: DemoLoginView | None = None
    features: FeaturesView
