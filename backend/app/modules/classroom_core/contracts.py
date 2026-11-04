"""Public classroom lifecycle contracts owned by Classroom Core."""

from typing import Annotated, Any, Literal
from pydantic import Field, StringConstraints
from app.modules.content_authoring.contracts import PublicQuestion
from app.modules.platform.contracts import Strict

from app.modules.platform.model_base import TrimmedModel


class CreateRoom(Strict):
    script_id: str = Field(max_length=36)


class JoinRoom(Strict):
    # 空白或全是空格的代碼在驗證層就擋下（422），不會被當成「找不到課程」。
    code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]
    alias: str = Field(min_length=1, max_length=40)
    avatar: str = Field(default="scholar", max_length=120)


class Command(Strict):
    action_id: str = Field(min_length=8, max_length=100)
    kind: Literal[
        "start",
        "draft",
        "answer",
        "barrage",
        "focus_message",
        "next",
        "end",
        "approve_question",
        "regenerate_question",
        "personal_summary",
    ]
    data: dict[str, Any] = Field(default_factory=dict)


class Reaction(Strict):
    action_id: str = Field(min_length=8, max_length=100)
    kind: Literal["heart", "like", "gift"]
    focus_id: str = Field(max_length=64)
    turn_index: int = Field(ge=0)


class MemberView(Strict):
    id: str
    alias: str
    avatar: str
    seat: int
    online: bool
    points: int
    achievements: list[str]
    username: str | None = None
    actor_type: Literal["human", "llm_student"] = "human"
    persona_id: str | None = None


class RoomSummary(Strict):
    """`GET /classrooms` 的一筆：帳號建立或加入過的教室。"""

    id: str
    title: str
    phase: str
    teacher: bool


class RoomView(Strict):
    id: str
    code: str | None
    title: str
    role: Literal["teacher", "student"]
    member_id: str | None
    phase: str
    seq: int
    server_now: float
    deadline_at: float | None
    question: PublicQuestion | None
    question_index: int
    question_run_id: str | None
    question_count: int
    members: list[MemberView]
    my_draft: dict[str, Any] | None
    my_answer: dict[str, Any] | None
    distribution: list[dict[str, Any]]
    focus: dict[str, Any] | None
    transcript: list[dict[str, Any]]
    preview: PublicQuestion | None
    summaries: dict[str, Any]
    available_actions: list[str]
    source_mode: str
    last_error: str | None


class LibraryClassroomView(Strict):
    """One row of GET /library/classrooms: a teacher's long-lived Classroom asset."""

    id: str
    title: str
    revision: int


class ScriptRevisionView(Strict):
    id: str
    revision: int


class ClassroomActionReceipt(Strict):
    status: str
    action_id: str
    seq: int
    room_id: str | None = None


class ClassroomEventView(Strict):
    seq: int
    type: str
    payload: dict[str, Any]


class ClassroomEventPage(Strict):
    events: list[ClassroomEventView]
    latest_seq: int
    more: bool


class RoomBudgetView(Strict):
    live_llm_call_budget: int
    used: int


class LibraryClassroomDetailView(Strict):
    id: str
    title: str
    revision: int
    assets: dict[str, Any]
    scripts: list[dict[str, Any]]
    sessions: list[dict[str, Any]]
    lessons: list[dict[str, Any]]


class AttachedScriptView(Strict):
    id: str
    revision: int
    document: dict[str, Any]
    classroom_id: str


class ClassroomBatchView(Strict):
    id: str
    classroom_id: str
    batch_id: str
    code: str | None


class ClassroomAISettingsView(Strict):
    default_profile_id: str | None = None
    fallback_profile_id: str | None = None
    model_matrix: dict[str, str] = Field(default_factory=dict)
    scenario_overrides: dict[str, Any] = Field(default_factory=dict)
    budgets: dict[str, Any] = Field(default_factory=dict)
    revision: int = 0


class Mutation(TrimmedModel):
    action_id: str = Field(min_length=8, max_length=100)


class CreateClassroom(Mutation):
    title: str = Field(min_length=1, max_length=160)


class AttachScript(Mutation):
    script_id: str | None = None
    document: dict[str, Any] | None = None


class CreateBatch(Mutation):
    script_id: str
