"""Public classroom lifecycle contracts owned by Classroom Core."""

from typing import Annotated, Any, Literal
from pydantic import Field, StringConstraints
from app.modules.content_authoring.contracts import PublicQuestion
from app.modules.platform.contracts import Strict


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
