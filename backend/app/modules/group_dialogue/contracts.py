"""Request contracts owned by Group Dialogue (group setup, start, commands and AI students)."""

from __future__ import annotations

from typing import Annotated, Any, Literal
from pydantic import Field, StringConstraints
from app.modules.classroom_core.contracts import ClassroomAISettingsView
from app.modules.content_authoring.contracts import PublicQuestion
from app.modules.platform.contracts import Strict
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


class GroupActionReceipt(Strict):
    status: str
    action_id: str
    seq: int


class GroupMetaView(Strict):
    id: str
    number: int
    label: str


class GroupStartReceipt(GroupActionReceipt):
    groups: list[GroupMetaView]
    snapshot_id: str


class GroupMemberIdentityView(Strict):
    username: str
    scope: Literal["teacher_hover_only"]


class GroupCollectionView(Strict):
    kind: Literal["GroupCollection"]
    id: str
    role: Literal["teacher", "student"]
    route: dict[str, str] | None = None
    title: str | None = None
    phase: str | None = None
    code: str | None = None
    asset_classroom_id: str | None = None
    ai_settings: ClassroomAISettingsView | None = None
    features: dict[str, Any] | None = None
    roster: list[dict[str, Any]] = Field(default_factory=list)
    roster_digest: str | None = None
    configuration: dict[str, Any] | None = None
    groups: list[dict[str, Any]] = Field(default_factory=list)
    available_actions: list[str] = Field(default_factory=list)
    unavailable_actions: dict[str, str] = Field(default_factory=dict)


class GroupRunView(Strict):
    kind: Literal["GroupRun"]
    id: str
    role: Literal["teacher", "student"]
    seq: int
    title: str
    phase: str
    deadline_at: float | None
    member_id: str | None
    members: list[dict[str, Any]]
    runtime_mode: str
    session_batch_id: str
    group_label: str
    classroom_id: str
    question: PublicQuestion | None
    transcript: list[dict[str, Any]]
    arguments: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    settlement: dict[str, Any]
    confirmed_members: list[str]
    my_summary: dict[str, Any] | None
    avatar_pack_id: str
    source_mode: str
    focus_notice: Any = None
    personal: dict[str, Any] | None = None
    available_actions: list[str] = Field(default_factory=list)
    unavailable_actions: dict[str, str] = Field(default_factory=dict)
    personal_progress: dict[str, Any] | None = None
    personal_overview: list[dict[str, Any]] | None = None


class LegacyGroupView(Strict):
    kind: Literal["Legacy"]
    id: str


GroupClassroomView = GroupCollectionView | GroupRunView | LegacyGroupView


class AIStudentCreatedView(Strict):
    account_id: str
    membership_id: str
    alias: str
    persona_id: str
    model: str
    provider_profile_id: str | None = None


class AddAIStudentsReceipt(GroupActionReceipt):
    created: list[AIStudentCreatedView]
    roster_digest: str
    room_id: str


class ClearAIStudentsReceipt(GroupActionReceipt):
    removed: int
    roster_digest: str
    room_id: str


class OtherSuggestionView(Strict):
    suggestion_text: str
    suggestion_id: str
    suggestion_model: str | None = None
    suggestion_provider: str
    provider_profile_id: str | None = None
    classroom_owner_id: str | None = None
