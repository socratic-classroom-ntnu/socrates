"""意見回饋 routes under /feedback：誰都能送；名單上的人讀列表與截圖（spec P1、P8）。"""

import base64
from typing import cast

from fastapi import APIRouter, Depends, Query, Request, Response

from app.modules.feedback import service
from app.modules.feedback.contracts import (
    FeedbackCreate,
    FeedbackCreated,
    FeedbackPage,
    FeedbackScreenshot,
    ScreenshotMime,
)
from app.modules.identity_access.repositories import Account
from app.modules.identity_access.service import COOKIE, account, same_origin
from app.modules.platform.errors import DomainError
from app.modules.platform.storage import transaction

router = APIRouter(prefix="/feedback", tags=["feedback"])


def _reader(db, request: Request) -> Account:
    """Anyone who is not on the list, signed out and guests included, sees nothing here (P8)."""
    try:
        current, _ = account(db, request)
    except DomainError:
        raise DomainError("FEEDBACK_NOT_FOUND", 404) from None
    service.require_reader(current)
    return current


def reader_guard(request: Request) -> None:
    """Runs before query validation: non-admins get FEEDBACK_NOT_FOUND, never a 422 (後台 spec P15)."""
    with transaction() as db:
        _reader(db, request)


@router.post("", response_model=FeedbackCreated, status_code=201)
def send_feedback(body: FeedbackCreate, request: Request) -> FeedbackCreated:
    same_origin(request)
    with transaction() as db:
        who = service.sender(db, request.cookies.get(COOKIE), request.headers.get("x-csrf-token"))
        feedback_id = service.submit(
            db,
            who,
            body,
            user_agent=request.headers.get("user-agent", ""),
            client_host=request.client.host if request.client else "unknown",
        )
    return FeedbackCreated(id=feedback_id)


@router.get("", response_model=FeedbackPage, dependencies=[Depends(reader_guard)])
def list_feedback(request: Request, page: int = Query(1, ge=1)) -> FeedbackPage:
    with transaction() as db:
        _reader(db, request)
        return service.list_page(db, page)


@router.get(
    "/{feedback_id}/screenshot",
    response_model=FeedbackScreenshot,
    dependencies=[Depends(reader_guard)],
)
def feedback_screenshot(
    feedback_id: str, request: Request, response: Response
) -> FeedbackScreenshot:
    """JSON rather than raw bytes: every classroom endpoint has a typed response (contract gate)."""
    with transaction() as db:
        _reader(db, request)
        data, mime = service.screenshot(db, feedback_id)
    response.headers["Cache-Control"] = "private, no-store"
    return FeedbackScreenshot(
        mime=cast(ScreenshotMime, mime), data_base64=base64.b64encode(data).decode()
    )
