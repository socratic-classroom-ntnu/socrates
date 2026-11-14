"""Course, course-join preview and activity routes.

Activity fixed paths (join-preview, join, copy) are registered before the generic /{action}
route so a student join is never mistaken for a teacher transition.
"""

from typing import Literal

from fastapi import APIRouter, Request, Response

from app.modules.course_management import activities as activity_service
from app.modules.course_management import courses as service
from app.modules.course_management import enrollment
from app.modules.course_management.contracts import (
    ActivityDetailsUpdate,
    ActivityDraft,
    ActivityJoin,
    ActivityJoinPreview,
    ActivityJoinResult,
    ActivityStudentList,
    ActivityTeacherList,
    ActivityTeacherView,
    CourseCreate,
    CourseJoin,
    CourseLists,
    CourseStudentView,
    CourseTeacherView,
    CourseUpdate,
    GuestActivityJoin,
    GuestCourseJoin,
    GuestJoinResult,
    JoinPreview,
    PublicActivityPreview,
    PublicJoinPreview,
)
from app.modules.identity_access.service import (
    account,
    auth_limit,
    display_name,
    set_session_cookie,
)
from app.modules.platform.errors import DomainError
from app.modules.platform.rate_limit import enforce_rate_limit
from app.modules.platform.storage import transaction

router = APIRouter(prefix="/courses", tags=["courses"])
preview_router = APIRouter(prefix="/course-join", tags=["courses"])
activities_router = APIRouter(prefix="/activities", tags=["activities"])


def _join_limit(request: Request, mutation: bool) -> None:
    """Counted in its own transaction: a wrong code raises 404, which would roll the count back."""
    host = request.client.host if request.client else "unknown"
    with transaction() as db:
        current, _ = account(db, request, mutation=mutation, allow_guest=True)
        enforce_rate_limit(db, f"course-join:{current.id}", 20, 60, error_code="RATE_LIMITED")
        # A whole class often shares the school's address; 200/min lets ~40 students retry.
        enforce_rate_limit(db, f"course-join-ip:{host}", 200, 60, error_code="RATE_LIMITED")


def _teacher_course(db, current, course_id: str):
    access = service.access_for(db, current, course_id)
    service.select_role(access, "teacher")
    return access.course


@router.get("", response_model=CourseLists)
def course_lists(request: Request):
    with transaction() as db:
        current, _ = account(db, request, allow_guest=True)
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
        current, _ = account(db, request, mutation=True, allow_guest=True)
        course = enrollment.find_by_code(db, body.code)
        row, _ = enrollment.enroll(db, current, course, body.display_name)
        return service.student_view(course, row)


@preview_router.get("/preview", response_model=JoinPreview)
def preview_join(code: str, request: Request):
    _join_limit(request, mutation=False)
    with transaction() as db:
        current, _ = account(db, request, allow_guest=True)
        course = enrollment.find_by_code(db, code)
        return {
            "course_id": course.id,
            "name": course.name,
            "teacher_name": course.teacher_name,
            "already_enrolled": enrollment.existing(db, current, course) is not None,
            "default_display_name": display_name(current),
            "open_activity_title": service.open_activity_title(db, course, activity_service.now()),
            "allow_guest": course.allow_guest,
        }


@preview_router.get("/public-preview", response_model=PublicJoinPreview)
def public_preview_join(code: str, request: Request):
    enrollment.public_preview_limit(request.client.host if request.client else "unknown")
    with transaction() as db:
        course = enrollment.find_by_code(db, code)
        return {"course_name": course.name, "allow_guest": course.allow_guest}


@preview_router.post("/guest", response_model=GuestJoinResult)
def guest_join_course(body: GuestCourseJoin, request: Request, response: Response):
    """Become a guest and join the course in one transaction; the cookie only after it commits."""
    auth_limit(request, "guest")
    with transaction() as db:
        course = enrollment.find_by_code(db, body.code)
        token, view = enrollment.join_as_new_guest(db, course, body.nickname, body.locale)
        result = {
            "account": view,
            "course_id": course.id,
            "activity_id": None,
            "activity_status": None,
        }
    set_session_cookie(response, token, guest=True)
    return result


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
        # A guest teaches nothing, so select_role only ever gives a guest the student view.
        current, _ = account(db, request, allow_guest=True)
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
        current, _ = account(db, request, allow_guest=True)
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


def _teacher_activity(db, current, activity_id: str):
    activity = activity_service.get_activity(db, activity_id)
    access = service.access_for(db, current, activity.course_id)
    service.select_role(access, "teacher")
    return activity


@activities_router.get("/{activity_id}/join-preview", response_model=ActivityJoinPreview)
def activity_join_preview(activity_id: str, request: Request):
    with transaction() as db:
        current, _ = account(db, request, allow_guest=True)
        activity = activity_service.get_activity(db, activity_id)
        return activity_service.join_preview(db, current, activity, activity_service.now())


@activities_router.get("/{activity_id}/public-preview", response_model=PublicActivityPreview)
def activity_public_preview(activity_id: str, request: Request):
    enrollment.public_preview_limit(request.client.host if request.client else "unknown")
    with transaction() as db:
        return activity_service.public_preview(db, activity_id, activity_service.now())


@activities_router.post("/{activity_id}/guest-join", response_model=GuestJoinResult)
def guest_join_activity(
    activity_id: str, body: GuestActivityJoin, request: Request, response: Response
):
    """Become a guest from an activity link and join its course, in one transaction."""
    auth_limit(request, "guest")
    with transaction() as db:
        activity = activity_service.get_activity(db, activity_id)
        token, result = activity_service.join_as_new_guest(
            db, activity, body.nickname, body.locale, activity_service.now()
        )
    set_session_cookie(response, token, guest=True)
    return result


@activities_router.post("/{activity_id}/join", response_model=ActivityJoinResult)
def join_activity(activity_id: str, body: ActivityJoin, request: Request):
    with transaction() as db:
        current, _ = account(db, request, mutation=True, allow_guest=True)
        activity = activity_service.get_activity(db, activity_id)
        return activity_service.join_by_activity(
            db, current, activity, body.display_name, activity_service.now()
        )


@activities_router.post("/{activity_id}/copy", response_model=ActivityTeacherView, status_code=201)
def copy_activity(activity_id: str, request: Request):
    with transaction() as db:
        current, _ = account(db, request, mutation=True)
        activity = _teacher_activity(db, current, activity_id)
        at = activity_service.now()
        activity_service.require_action(db, activity, "copy", at)
        return activity_service.teacher_view(db, activity_service.copy(db, activity), at)


@activities_router.get("/{activity_id}", response_model=ActivityTeacherView)
def get_activity(activity_id: str, request: Request):
    with transaction() as db:
        current, _ = account(db, request)
        activity = _teacher_activity(db, current, activity_id)
        return activity_service.teacher_view(db, activity, activity_service.now())


@activities_router.put("/{activity_id}", response_model=ActivityTeacherView)
def update_activity(activity_id: str, body: ActivityDraft, request: Request):
    with transaction() as db:
        current, _ = account(db, request, mutation=True)
        activity = _teacher_activity(db, current, activity_id)
        at = activity_service.now()
        activity_service.require_action(db, activity, "update", at)
        activity = activity_service.update_draft(db, activity, body)
        return activity_service.teacher_view(db, activity, at)


@activities_router.patch("/{activity_id}", response_model=ActivityTeacherView)
def update_activity_details(activity_id: str, body: ActivityDetailsUpdate, request: Request):
    with transaction() as db:
        current, _ = account(db, request, mutation=True)
        activity = _teacher_activity(db, current, activity_id)
        at = activity_service.now()
        activity_service.require_action(db, activity, "update_details", at)
        activity = activity_service.update_details(db, activity, body, at)
        return activity_service.teacher_view(db, activity, at)


@activities_router.delete("/{activity_id}", status_code=204, response_class=Response)
def delete_activity(activity_id: str, request: Request):
    with transaction() as db:
        current, _ = account(db, request, mutation=True)
        activity = _teacher_activity(db, current, activity_id)
        activity_service.require_action(db, activity, "delete", activity_service.now())
        activity_service.delete(db, activity)
    return Response(status_code=204)


@activities_router.post("/{activity_id}/{action}", response_model=ActivityTeacherView)
def transition_activity(
    activity_id: str,
    action: Literal["publish", "start_now", "end_now"],
    request: Request,
):
    with transaction() as db:
        current, _ = account(db, request, mutation=True)
        activity = _teacher_activity(db, current, activity_id)
        at = activity_service.now()
        activity_service.require_action(db, activity, action, at)
        if action == "publish":
            activity_service.publish(db, activity, at)
        elif action == "start_now":
            activity = activity_service.start_now(db, activity, at)
        else:
            activity = activity_service.end_now(db, activity, at)
        return activity_service.teacher_view(db, activity, at)
