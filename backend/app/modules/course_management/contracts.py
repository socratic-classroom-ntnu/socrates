"""Public course-management contracts: activity status from server time, the teacher actions each
status allows, and the request/response models."""

from typing import Literal, Protocol

from pydantic import Field, field_validator, model_validator

from app.modules.platform.contracts import Strict

ActivityStatus = Literal["draft", "scheduled", "open", "ended"]
TeacherAction = Literal[
    "update", "update_details", "publish", "start_now", "end_now", "copy", "delete"
]

_ORDER: tuple[TeacherAction, ...] = (
    "update",
    "update_details",
    "publish",
    "start_now",
    "end_now",
    "copy",
    "delete",
)


class ActivityTimes(Protocol):
    # Read-only members so ORM rows (SQLAlchemy Mapped descriptors) satisfy the protocol too.
    @property
    def published_at(self) -> float | None: ...

    @property
    def starts_at(self) -> float | None: ...

    @property
    def ends_at(self) -> float | None: ...


def status(activity: ActivityTimes, now: float) -> ActivityStatus:
    if activity.published_at is None:
        return "draft"
    if activity.ends_at is not None and now >= activity.ends_at:
        return "ended"
    if activity.starts_at is not None and now >= activity.starts_at:
        return "open"
    return "scheduled"


def teacher_actions(current: ActivityStatus, locked: bool) -> list[TeacherAction]:
    allowed: set[TeacherAction] = {"copy", "delete"}
    if current == "draft":
        allowed |= {"update", "publish"}
    if current in ("scheduled", "open"):
        # Name and end time stay editable after the content locks; the questions do not.
        allowed |= {"update_details", "end_now"}
        if not locked:
            allowed |= {"update", "publish"}
    if current == "scheduled":
        allowed.add("start_now")
    return [action for action in _ORDER if action in allowed]


class CourseCreate(Strict):
    name: str = Field(min_length=1, max_length=120)
    teacher_name: str = Field(min_length=1, max_length=64)
    intro: str = Field(default="", max_length=4000)
    goals: str = Field(default="", max_length=4000)


class CourseUpdate(Strict):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    teacher_name: str | None = Field(default=None, min_length=1, max_length=64)
    intro: str | None = Field(default=None, max_length=4000)
    goals: str | None = Field(default=None, max_length=4000)

    @field_validator("name", "teacher_name", "intro", "goals")
    @classmethod
    def reject_null(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("field cannot be null")
        return value


CourseAction = Literal[
    "update",
    "rotate_code",
    "disable_code",
    "enable_code",
    "create_activity",
]


class CourseTeacherView(Strict):
    role: Literal["teacher"]
    id: str
    name: str
    teacher_name: str
    intro: str
    goals: str
    code: str
    code_enabled: bool
    student_count: int
    activity_count: int
    available_actions: list[CourseAction]


class CourseStudentView(Strict):
    role: Literal["student"]
    id: str
    name: str
    teacher_name: str
    intro: str
    code: str | None  # None while the teacher has the code disabled
    display_name: str


class CourseJoin(Strict):
    code: str = Field(min_length=1, max_length=32)
    display_name: str = Field(min_length=1, max_length=40)


class JoinPreview(Strict):
    course_id: str
    name: str
    teacher_name: str
    already_enrolled: bool
    default_display_name: str
    open_activity_title: str | None


class PublicJoinPreview(Strict):
    """What an anonymous visitor may learn from a code or activity link: the course name only."""

    course_name: str


class ActivityDraft(Strict):
    """The teacher's single input: one text that is both the activity name and the material the
    first scenario is written from. Incomplete drafts are rejected, never stored."""

    title: str = Field(min_length=1, max_length=300)
    starts_at: float | None = None
    ends_at: float


class ActivityDetailsUpdate(Strict):
    """Operational fields a teacher may still change after the content locks."""

    title: str | None = Field(default=None, min_length=1, max_length=300)
    ends_at: float | None = None

    @field_validator("title", "ends_at")
    @classmethod
    def reject_null(cls, value):
        if value is None:
            raise ValueError("field cannot be null")
        return value

    @model_validator(mode="after")
    def at_least_one(self):
        if not self.model_fields_set:
            raise ValueError("nothing to update")
        return self


class ActivityTeacherView(Strict):
    id: str
    course_id: str
    status: ActivityStatus
    locked: bool
    has_unpublished_changes: bool
    revision: int | None
    draft: ActivityDraft
    starts_at: float | None
    ends_at: float | None
    available_actions: list[TeacherAction]


class ActivityTeacherCard(Strict):
    id: str
    title: str
    status: ActivityStatus
    locked: bool
    has_unpublished_changes: bool
    starts_at: float | None
    ends_at: float | None
    available_actions: list[TeacherAction]


class ActivityStudentCard(Strict):
    id: str
    title: str
    status: Literal["scheduled", "open", "ended"]
    starts_at: float
    ends_at: float


class ActivityTeacherList(Strict):
    role: Literal["teacher"]
    items: list[ActivityTeacherCard]


class ActivityStudentList(Strict):
    role: Literal["student"]
    items: list[ActivityStudentCard]


class ActivityJoinPreview(Strict):
    activity_id: str
    title: str
    course_id: str
    course_name: str
    teacher_name: str
    starts_at: float
    ends_at: float
    status: Literal["scheduled", "open", "ended"]
    already_enrolled: bool
    default_display_name: str


class ActivityJoin(Strict):
    display_name: str = Field(min_length=1, max_length=40)


class ActivityJoinResult(Strict):
    course_id: str
    activity_id: str
    enrolled_now: bool


class CourseTeachingCard(Strict):
    id: str
    name: str
    teacher_name: str
    code: str
    code_enabled: bool
    student_count: int
    activity_count: int
    open_activity_count: int


class CourseLearningCard(Strict):
    id: str
    name: str
    teacher_name: str
    open_activity_count: int
    highlight: ActivityStudentCard | None


class CourseLists(Strict):
    teaching: list[CourseTeachingCard]
    learning: list[CourseLearningCard]
