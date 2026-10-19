"""Request contracts owned by Group Dialogue (group setup, start, commands and AI students)."""

from __future__ import annotations

from typing import Annotated, Any
from pydantic import Field, StringConstraints
from app.modules.platform.model_base import TrimmedModel


class Configure(TrimmedModel):
    action_id: str = Field(min_length=1, max_length=100)
    expected_roster_digest: str = Field(max_length=128)
    group_count: int = Field(ge=1, le=40)
    members_per_group: int = Field(ge=1, le=40)
    assignments: dict[Annotated[str, StringConstraints(max_length=64)], int] = Field(
        default_factory=dict, max_length=1600
    )
    avatar_pack_id: str = Field(default="stickman", min_length=1, max_length=120)


class Start(TrimmedModel):
    action_id: str = Field(min_length=1, max_length=100)
    expected_roster_digest: str = Field(max_length=128)
    accept_temporary_aliases: bool = False


class GroupCommand(TrimmedModel):
    action_id: str = Field(min_length=1, max_length=100)
    kind: str = Field(max_length=40)
    data: dict[str, Any] = Field(default_factory=dict)


class AddAIStudents(TrimmedModel):
    action_id: str = Field(min_length=8, max_length=100)
    count: int = Field(ge=1, le=40)
    model: str = Field(default="openrouter/free", min_length=1, max_length=160)
    provider_profile_id: str | None = Field(default=None, max_length=36)


class ClearAIStudents(TrimmedModel):
    action_id: str = Field(min_length=8, max_length=100)


class OtherSuggestionRequest(TrimmedModel):
    question_id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=300)
    scenario: str = Field(min_length=1, max_length=12000)
    existing_options: list[Annotated[str, StringConstraints(max_length=2000)]] = Field(
        default_factory=list, max_length=20
    )
    room_id: str | None = Field(default=None, max_length=36)
