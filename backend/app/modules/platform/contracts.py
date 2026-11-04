"""Shared Pydantic contract base for backend modules."""

from pydantic import ConfigDict
from app.modules.platform.model_base import TrimmedModel

from pydantic import BaseModel


class Strict(TrimmedModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class PublicConfigView(BaseModel):
    google_cse_id: str
    search_scope: str
    search_state: str
    debug_mode: bool
