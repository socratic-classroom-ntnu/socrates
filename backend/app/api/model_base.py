"""Shared request-model behavior for API text fields."""

from pydantic import BaseModel, ConfigDict


class TrimmedModel(BaseModel):
    """Trim strings before field length and business validation."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
