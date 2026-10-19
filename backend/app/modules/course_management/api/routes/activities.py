"""Activity routes: teacher draft/publish transitions and the student activity-QR join.

Fixed paths (join-preview, join, copy) are registered before the generic ``/{action}`` route so a
student join is never mistaken for a teacher transition.
"""

from typing import Literal

from fastapi import APIRouter, Request

from app.modules.course_management.api.schemas import (
    ActivityDraft,
    ActivityJoin,
    ActivityJoinPreview,
    ActivityJoinResult,
    ActivityTeacherView,
)
from app.modules.course_management.services import activities as service
from app.modules.course_management.services import courses as course_service
from app.modules.identity_access.api.request_account import account
from app.modules.platform.repositories.classroom_storage import transaction

router = APIRouter(prefix="/activities", tags=["activities"])


def _teacher_activity(db, current, activity_id: str):
    activity = service.get_activity(db, activity_id)
    access = course_service.access_for(db, current, activity.course_id)
    course_service.select_role(access, "teacher")
    return activity


@router.get("/{activity_id}/join-preview", response_model=ActivityJoinPreview)
def activity_join_preview(activity_id: str, request: Request):
    with transaction() as db:
        current, _ = account(db, request)
        activity = service.get_activity(db, activity_id)
        return service.join_preview(db, current, activity, service.now())


@router.post("/{activity_id}/join", response_model=ActivityJoinResult)
def join_activity(activity_id: str, body: ActivityJoin, request: Request):
    with transaction() as db:
        current, _ = account(db, request, mutation=True)
        activity = service.get_activity(db, activity_id)
        return service.join_by_activity(db, current, activity, body.display_name, service.now())


@router.post("/{activity_id}/copy", response_model=ActivityTeacherView, status_code=201)
def copy_activity(activity_id: str, request: Request):
    with transaction() as db:
        current, _ = account(db, request, mutation=True)
        activity = _teacher_activity(db, current, activity_id)
        at = service.now()
        service.require_action(db, activity, "copy", at)
        return service.teacher_view(db, service.copy(db, activity), at)


@router.get("/{activity_id}", response_model=ActivityTeacherView)
def get_activity(activity_id: str, request: Request):
    with transaction() as db:
        current, _ = account(db, request)
        activity = _teacher_activity(db, current, activity_id)
        return service.teacher_view(db, activity, service.now())


@router.put("/{activity_id}", response_model=ActivityTeacherView)
def update_activity(activity_id: str, body: ActivityDraft, request: Request):
    with transaction() as db:
        current, _ = account(db, request, mutation=True)
        activity = _teacher_activity(db, current, activity_id)
        at = service.now()
        service.require_action(db, activity, "update", at)
        activity = service.update_draft(db, activity, body)
        return service.teacher_view(db, activity, at)


@router.post("/{activity_id}/{action}", response_model=ActivityTeacherView)
def transition_activity(
    activity_id: str,
    action: Literal["publish", "start_now", "end_now"],
    request: Request,
):
    with transaction() as db:
        current, _ = account(db, request, mutation=True)
        activity = _teacher_activity(db, current, activity_id)
        at = service.now()
        service.require_action(db, activity, action, at)
        if action == "publish":
            service.publish(db, activity, at)
        elif action == "start_now":
            service.start_now(db, activity, at)
        else:
            service.end_now(db, activity, at)
        return service.teacher_view(db, activity, at)
