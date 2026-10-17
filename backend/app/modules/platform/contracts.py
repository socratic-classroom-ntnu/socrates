"""Shared Pydantic contract base for backend modules."""

from pydantic import ConfigDict
from app.api.model_base import TrimmedModel


class Strict(TrimmedModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
