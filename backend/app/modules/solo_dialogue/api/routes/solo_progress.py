"""T5 live progress under /solo: the course owner only, and never what students wrote."""

from fastapi import APIRouter, Request

from app.modules.identity_access.api.request_account import account
from app.modules.platform.repositories.classroom_storage import transaction
from app.modules.solo_dialogue.api.solo_schemas import SoloActivityProgressView
from app.modules.solo_dialogue.services import solo_progress as service

router = APIRouter(prefix="/solo", tags=["solo"])


@router.get("/activities/{activity_id}/progress", response_model=SoloActivityProgressView)
def get_activity_progress(activity_id: str, request: Request):
    with transaction() as db:
        current, _ = account(db, request)
        return service.progress_view(db, current, activity_id, service.now())
