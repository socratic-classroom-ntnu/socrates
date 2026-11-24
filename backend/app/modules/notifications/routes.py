from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import APIRouter, Depends, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from starlette.exceptions import HTTPException

from app.modules.admin.service import admin_account, admin_guard
from app.modules.identity_access import service as identity
from app.modules.notifications import repositories, service
from app.modules.notifications.contracts import (
    AnnouncementInput,
    AnnouncementView,
    Notification,
    NotificationReadInput,
)
from app.modules.platform.errors import DomainError
from app.modules.platform.storage import transaction


class AnnouncementRoute(APIRoute):
    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        handle = super().get_route_handler()

        async def with_announcement_errors(request: Request) -> Response:
            try:
                return await handle(request)
            except RequestValidationError as error:
                # FastAPI decodes JSON before it runs dependencies. Check authorization even
                # when decoding failed, so the response cannot reveal the admin endpoint.
                if any(item["type"] == "json_invalid" for item in error.errors()):
                    await run_in_threadpool(admin_guard, request)
                raise DomainError("ANNOUNCEMENT_INVALID", 422) from None
            except HTTPException as error:
                # Invalid UTF-8 in a JSON body also fails before dependency resolution.
                if error.status_code != 400:
                    raise
                await run_in_threadpool(admin_guard, request)
                raise DomainError("ANNOUNCEMENT_INVALID", 422) from None

        return with_announcement_errors


admin_router = APIRouter(
    prefix="/admin/announcements",
    tags=["admin"],
    dependencies=[Depends(admin_guard)],
    route_class=AnnouncementRoute,
)
router = APIRouter(prefix="/notifications", tags=["notifications"])


@admin_router.get("", response_model=list[AnnouncementView])
def announcements(request: Request) -> list[AnnouncementView]:
    with transaction() as db:
        admin_account(db, request)
        return service.list_announcements(db)


@admin_router.post("", response_model=AnnouncementView, status_code=201)
def publish_announcement(body: AnnouncementInput, request: Request) -> AnnouncementView:
    with transaction() as db:
        actor = admin_account(db, request, mutation=True)
        return service.publish(db, actor, body)


@admin_router.delete("/{announcement_id}", status_code=204)
def delete_announcement(announcement_id: str, request: Request) -> Response:
    with transaction() as db:
        admin_account(db, request, mutation=True)
        service.remove(db, announcement_id)
    return Response(status_code=204)


@router.get("", response_model=list[Notification])
def notifications(request: Request, response: Response) -> list[Notification]:
    response.headers["Cache-Control"] = "private, no-store"
    with transaction() as db:
        account, _ = identity.account(db, request, allow_guest=True)
        return service.list_notifications(db, account)


@router.post("/read", status_code=204)
def mark_notification_read(body: NotificationReadInput, request: Request) -> Response:
    with transaction() as db:
        account, session = identity.account(db, request, mutation=True, allow_guest=True)
        if account.kind == "guest":
            # The guest merge/expiry takes the same account lock and ends its session.
            repositories.lock_account(db, account.id)
            db.expire(account)
            db.expunge(session)
            account, _ = identity.account(db, request, mutation=True, allow_guest=True)
        service.mark_read(db, account, body.id)
    return Response(status_code=204)
