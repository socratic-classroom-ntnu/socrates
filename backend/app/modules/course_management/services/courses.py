"""Course creation, authorization, projections, and enrollment-code lifecycle."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.modules.course_management.domain.codes import new_code
from app.modules.course_management.repositories.models import Activity, Course, Enrollment
from app.modules.course_management.services import activities as activity_service
from app.modules.platform.errors import DomainError
from app.modules.platform.repositories.classroom_storage import Account

if TYPE_CHECKING:
    from app.modules.course_management.api.schemas import CourseCreate, CourseUpdate


@dataclass(frozen=True)
class CourseAccess:
    course: Course
    teacher: bool
    enrollment: Enrollment | None


def create(db, owner: Account, data: CourseCreate) -> Course:
    values = data.model_dump()
    for _ in range(5):
        course = Course(owner_id=owner.id, code=new_code(), **values)
        try:
            with db.begin_nested():
                db.add(course)
                db.flush()
            return course
        except IntegrityError:
            continue
    raise DomainError("COURSE_CODE_EXHAUSTED", 503)


def access_for(db, account: Account, course_id: str) -> CourseAccess:
    course = db.get(Course, course_id)
    if course is None:
        raise DomainError("COURSE_NOT_FOUND", 404)
    enrollment = db.scalar(
        select(Enrollment).where(
            Enrollment.course_id == course.id,
            Enrollment.account_id == account.id,
        )
    )
    teacher = course.owner_id == account.id
    if not teacher and enrollment is None:
        raise DomainError("COURSE_NOT_FOUND", 404)
    return CourseAccess(course=course, teacher=teacher, enrollment=enrollment)


def select_role(
    access: CourseAccess, requested: Literal["teacher", "student"] | None
) -> Literal["teacher", "student"]:
    if requested == "teacher" and not access.teacher:
        raise DomainError("COURSE_NOT_FOUND", 404)
    if requested == "student" and access.enrollment is None:
        raise DomainError("COURSE_NOT_FOUND", 404)
    if requested is not None:
        return requested
    if access.teacher:
        return "teacher"
    if access.enrollment is not None:
        return "student"
    raise DomainError("COURSE_NOT_FOUND", 404)


def _available_actions(course: Course) -> list[str]:
    code_action = "disable_code" if course.code_enabled else "enable_code"
    return ["update", "rotate_code", code_action, "create_activity"]


def teacher_view(db, course: Course) -> dict:
    student_count = db.scalar(
        select(func.count()).select_from(Enrollment).where(Enrollment.course_id == course.id)
    )
    activity_count = db.scalar(
        select(func.count())
        .select_from(Activity)
        .where(Activity.course_id == course.id, Activity.deleted.is_(False))
    )
    return {
        "role": "teacher",
        "id": course.id,
        "name": course.name,
        "teacher_name": course.teacher_name,
        "intro": course.intro,
        "goals": course.goals,
        "code": course.code,
        "code_enabled": course.code_enabled,
        "student_count": student_count or 0,
        "activity_count": activity_count or 0,
        "available_actions": _available_actions(course),
    }


def student_view(course: Course, enrollment: Enrollment) -> dict:
    return {
        "role": "student",
        "id": course.id,
        "name": course.name,
        "teacher_name": course.teacher_name,
        "intro": course.intro,
        "code": course.code if course.code_enabled else None,
        "display_name": enrollment.display_name,
    }


def highlight(db, course: Course, at: float) -> dict | None:
    return activity_service.course_summaries(db, [course.id], at)[course.id]["highlight"]


def open_activity_title(db, course: Course, at: float) -> str | None:
    return activity_service.course_summaries(db, [course.id], at)[course.id]["open_activity_title"]


def lists(db, account: Account) -> dict:
    """Both home tabs in a fixed number of queries, however many courses the account has."""
    at = activity_service.now()
    teaching = db.scalars(
        select(Course).where(Course.owner_id == account.id).order_by(Course.created_at, Course.id)
    ).all()
    learning = db.scalars(
        select(Course)
        .join(Enrollment, Enrollment.course_id == Course.id)
        .where(Enrollment.account_id == account.id)
        .order_by(Enrollment.created_at, Course.id)
    ).all()
    summaries = activity_service.course_summaries(
        db, sorted({course.id for course in [*teaching, *learning]}), at
    )
    students: dict[str, int] = {}
    if teaching:
        students = {
            course_id: count
            for course_id, count in db.execute(
                select(Enrollment.course_id, func.count())
                .where(Enrollment.course_id.in_([course.id for course in teaching]))
                .group_by(Enrollment.course_id)
            ).all()
        }
    return {
        "teaching": [
            {
                "id": course.id,
                "name": course.name,
                "teacher_name": course.teacher_name,
                "code": course.code,
                "code_enabled": course.code_enabled,
                "student_count": students.get(course.id, 0),
                "activity_count": summaries[course.id]["activity_count"],
                "open_activity_count": summaries[course.id]["open_activity_count"],
            }
            for course in teaching
        ],
        "learning": [
            {
                "id": course.id,
                "name": course.name,
                "teacher_name": course.teacher_name,
                "open_activity_count": summaries[course.id]["open_activity_count"],
                "highlight": summaries[course.id]["highlight"],
            }
            for course in learning
        ],
    }


def update(course: Course, data: CourseUpdate) -> Course:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(course, field, value)
    course.updated_at = time.time()
    return course


def rotate_code(db, course: Course) -> Course:
    for _ in range(5):
        try:
            with db.begin_nested():
                course.code = new_code()
                course.code_enabled = True
                course.updated_at = time.time()
                db.flush()
            return course
        except IntegrityError:
            continue
    raise DomainError("COURSE_CODE_EXHAUSTED", 503)
