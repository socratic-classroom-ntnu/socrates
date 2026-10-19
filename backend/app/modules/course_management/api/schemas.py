"""Public course-management request and response contracts."""

from typing import Literal

from pydantic import ConfigDict, Field, field_validator, model_validator

from app.modules.platform.api.model_base import TrimmedModel
from app.modules.course_management.domain.activity_status import ActivityStatus, TeacherAction


class Strict(TrimmedModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


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


class ActivityOption(Strict):
    id: str = Field(min_length=1, max_length=64)
    text: str = Field(min_length=1, max_length=2000)


class QuestionDraft(Strict):
    id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=300)
    scenario: str = Field(min_length=1, max_length=12000)
    options: list[ActivityOption] = Field(min_length=2, max_length=4)
    follow_up_direction: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def unique_options(self):
        if len({option.id for option in self.options}) != len(self.options):
            raise ValueError("option ids must be unique")
        return self


class ActivityDraft(Strict):
    """Complete but unpublished content; incomplete drafts are rejected, never stored."""

    title: str = Field(min_length=1, max_length=300)
    topic_direction: str = Field(min_length=1, max_length=4000)
    analysis_focus: str = Field(default="", max_length=4000)
    starts_at: float | None = None
    ends_at: float
    questions: list[QuestionDraft] = Field(min_length=1, max_length=30)

    @model_validator(mode="after")
    def unique_questions(self):
        if len({question.id for question in self.questions}) != len(self.questions):
            raise ValueError("question ids must be unique")
        return self


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
    question_count: int
    starts_at: float | None
    ends_at: float | None
    available_actions: list[TeacherAction]


class ActivityStudentCard(Strict):
    id: str
    title: str
    status: Literal["scheduled", "open", "ended"]
    question_count: int
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
    question_count: int
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
