"""T6 statistics under /solo: the course owner only, confirmed stances and reasons only."""

from fastapi import APIRouter, Request

from app.modules.identity_access.api.request_account import account
from app.modules.platform.repositories.classroom_storage import transaction
from app.modules.solo_dialogue.api.solo_schemas import SoloActivityAnalysisView
from app.modules.solo_dialogue.services import solo_analysis as service
from app.modules.solo_dialogue.services.solo_progress import now

router = APIRouter(prefix="/solo", tags=["solo"])


@router.get("/activities/{activity_id}/analysis", response_model=SoloActivityAnalysisView)
def get_activity_analysis(activity_id: str, request: Request):
    with transaction() as db:
        current, _ = account(db, request)
        return service.analysis_view(db, current, activity_id, now())
