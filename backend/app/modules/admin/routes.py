"""後台 routes under /admin: switches and platform admins (spec 〈介面〉)."""

from fastapi import APIRouter, Depends, Request, Response

from app.modules.admin import service
from app.modules.admin.contracts import AdminCreate, AdminView, ToggleUpdate, ToggleView
from app.modules.identity_access import service as identity
from app.modules.platform.storage import transaction

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(service.admin_guard)])


@router.get("/toggles", response_model=list[ToggleView])
def list_toggles(request: Request) -> list[ToggleView]:
    with transaction() as db:
        service.admin_account(db, request)
        return service.toggle_views(db)


@router.put("/toggles/{key}", response_model=ToggleView)
def put_toggle(key: str, body: ToggleUpdate, request: Request) -> ToggleView:
    with transaction() as db:
        actor = service.admin_account(db, request, mutation=True)
        return service.update_toggle(db, actor, key, body.enabled)


@router.get("/admins", response_model=list[AdminView])
def list_admins(request: Request) -> list[AdminView]:
    with transaction() as db:
        actor = service.admin_account(db, request)
        return service.admin_views(db, actor)


@router.post("/admins", response_model=AdminView, status_code=201)
def add_admin(body: AdminCreate, request: Request) -> AdminView:
    with transaction() as db:
        actor = service.admin_account(db, request, mutation=True)
        return service.admin_view(identity.grant_admin(db, body.username), actor)


@router.delete("/admins/{account_id}", status_code=204)
def remove_admin(account_id: str, request: Request) -> Response:
    with transaction() as db:
        actor = service.admin_account(db, request, mutation=True)
        identity.revoke_admin(db, actor.id, account_id)
    return Response(status_code=204)
