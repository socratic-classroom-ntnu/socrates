"""The teacher's AI 連線設定 under /ai-settings/connection (teacher accounts only)."""

from fastapi import APIRouter, Request

from app.modules.ai_connection import connection
from app.modules.ai_connection.contracts import ConnectionView
from app.modules.identity_access.service import account
from app.modules.platform.storage import transaction

router = APIRouter(prefix="/ai-settings/connection", tags=["ai-connection"])


@router.get("", response_model=ConnectionView)
def get_connection(request: Request) -> ConnectionView:
    with transaction() as db:
        current, _ = account(db, request)
        connection.require_teacher(current)
        return connection.view(db, current.id)
