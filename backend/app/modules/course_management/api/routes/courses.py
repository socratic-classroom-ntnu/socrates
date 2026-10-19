"""Course CRUD and enrollment-code transition routes."""

from typing import Literal

from fastapi import APIRouter, Request

from app.modules.course_management.api.schemas import (
    ActivityDraft,
    ActivityStudentList,
    ActivityTeacherList,
    ActivityTeacherView,
    CourseCreate,
    CourseJoin,
    CourseLists,
    CourseStudentView,
    CourseTeacherView,
    CourseUpdate,
    JoinPreview,
)
from app.modules.course_management.services import activities as activity_service
from app.modules.course_management.services import courses as service
from app.modules.course_management.services import enrollment
from app.modules.identity_access.api.request_account import account
from app.modules.platform.errors import DomainError
from app.modules.platform.repositories.classroom_storage import transaction
from app.modules.platform.services.rate_limit import limit

router = APIRouter(prefix="/courses", tags=["courses"])
preview_router = APIRouter(prefix="/course-join", tags=["courses"])


def _join_limit(request: Request, mutation: bool) -> None:
    """Counted in its own transaction: a wrong code raises 404, which would roll the count back."""
    host = request.client.host if request.client else "unknown"
    with transaction() as db:
        current, _ = account(db, request, mutation=mutation)
        limit(db, f"course-join:{current.id}", 20, 60, error_code="RATE_LIMITED")
        limit(db, f"course-join-ip:{host}", 60, 60, error_code="RATE_LIMITED")


def _teacher_course(db, current, course_id: str):
    access = service.access_for(db, current, course_id)
    service.select_role(access, "teacher")
    return access.course


@router.get("", response_model=CourseLists)
def course_lists(request: Request):
    with transaction() as db:
        current, _ = account(db, request)
        return service.lists(db, current)


@router.post("", response_model=CourseTeacherView, status_code=201)
def create_course(body: CourseCreate, request: Request):
    with transaction() as db:
        current, _ = account(db, request, mutation=True)
        course = service.create(db, current, body)
        return service.teacher_view(db, course)


@router.post("/join", response_model=CourseStudentView)
def join_course(body: CourseJoin, request: Request):
    _join_limit(request, mutation=True)
    with transaction() as db:
        current, _ = account(db, request, mutation=True)
        course = enrollment.find_by_code(db, body.code)
        row, _ = enrollment.enroll(db, current, course, body.display_name)
        return service.student_view(course, row)


@preview_router.get("/preview", response_model=JoinPreview)
def preview_join(code: str, request: Request):
    _join_limit(request, mutation=False)
    with transaction() as db:
        current, _ = account(db, request)
        course = enrollment.find_by_code(db, code)
        return {
            "course_id": course.id,
            "name": course.name,
            "teacher_name": course.teacher_name,
            "already_enrolled": enrollment.existing(db, current, course) is not None,
            "default_display_name": current.username,
        }


@router.get(
    "/{course_id}",
    response_model=CourseTeacherView | CourseStudentView,
)
def get_course(
    course_id: str,
    request: Request,
    role: Literal["teacher", "student"] | None = None,
):
    with transaction() as db:
        current, _ = account(db, request)
        access = service.access_for(db, current, course_id)
        selected = service.select_role(access, role)
        if selected == "teacher":
            return service.teacher_view(db, access.course)
        assert access.enrollment is not None
        return service.student_view(access.course, access.enrollment)


@router.patch("/{course_id}", response_model=CourseTeacherView)
def update_course(course_id: str, body: CourseUpdate, request: Request):
    with transaction() as db:
        current, _ = account(db, request, mutation=True)
        course = _teacher_course(db, current, course_id)
        service.update(course, body)
        return service.teacher_view(db, course)


@router.post(
    "/{course_id}/activities",
    response_model=ActivityTeacherView,
    status_code=201,
)
def create_activity(course_id: str, body: ActivityDraft, request: Request):
    with transaction() as db:
        current, _ = account(db, request, mutation=True)
        course = _teacher_course(db, current, course_id)
        activity = activity_service.create_draft(db, course, body)
        return activity_service.teacher_view(db, activity, activity_service.now())


@router.get(
    "/{course_id}/activities",
    response_model=ActivityTeacherList | ActivityStudentList,
)
def list_activities(
    course_id: str,
    request: Request,
    role: Literal["teacher", "student"] | None = None,
):
    with transaction() as db:
        current, _ = account(db, request)
        access = service.access_for(db, current, course_id)
        selected = service.select_role(access, role)
        at = activity_service.now()
        if selected == "teacher":
            return {
                "role": "teacher",
                "items": activity_service.teacher_cards(db, access.course, at),
            }
        return {"role": "student", "items": activity_service.student_cards(db, access.course, at)}


@router.post(
    "/{course_id}/{action}",
    response_model=CourseTeacherView,
)
def transition_course(
    course_id: str,
    action: Literal["rotate_code", "disable_code", "enable_code"],
    request: Request,
):
    with transaction() as db:
        current, _ = account(db, request, mutation=True)
        course = _teacher_course(db, current, course_id)
        if action == "rotate_code":
            service.rotate_code(db, course)
        elif action == "disable_code":
            if not course.code_enabled:
                raise DomainError("COURSE_ACTION_UNAVAILABLE")
            course.code_enabled = False
        else:
            if course.code_enabled:
                raise DomainError("COURSE_ACTION_UNAVAILABLE")
            course.code_enabled = True
        return service.teacher_view(db, course)
