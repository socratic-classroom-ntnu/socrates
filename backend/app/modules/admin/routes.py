"""後台 routes under /admin: switches and platform admins (spec 〈介面〉)."""

from fastapi import APIRouter, Depends, Query, Request, Response

from app.modules.admin import reports, service, system_ai
from app.modules.admin.contracts import (
    AdminCreate,
    AdminView,
    EvalReportView,
    SystemAIInput,
    SystemAIModelsInput,
    SystemAIModelsView,
    SystemAITestView,
    SystemAIView,
    ToggleUpdate,
    ToggleView,
    VoiceReportView,
)
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


# ---- 系統 AI（spec P30–P37）：網址檢查（DNS）與 provider 呼叫都在兩段 transaction 之間 ----


@router.get("/system-ai", response_model=SystemAIView)
def get_system_ai(request: Request) -> SystemAIView:
    with transaction() as db:
        service.admin_account(db, request)
        return system_ai.view(db)


@router.post("/system-ai/test", response_model=SystemAITestView)
async def test_system_ai(body: SystemAIInput, request: Request) -> SystemAITestView:
    draft = system_ai.check_fields(body)
    with transaction() as db:
        service.admin_account(db, request, mutation=True)
        owner_id, stored, _ = system_ai.current(db)
    await system_ai.probe(system_ai.with_key(draft, stored), owner_id)
    return SystemAITestView()


@router.put("/system-ai", response_model=SystemAIView)
async def put_system_ai(body: SystemAIInput, request: Request) -> SystemAIView:
    draft = system_ai.check_fields(body)
    with transaction() as db:
        service.admin_account(db, request, mutation=True)
        owner_id, stored, seen = system_ai.current(db)
    # Tested again: the page's word is not enough (P37).
    config = await system_ai.probe(system_ai.with_key(draft, stored), owner_id)
    with transaction() as db:
        # Checked again: whoever started this may have lost the admin role during the test.
        actor = service.admin_account(db, request, mutation=True)
        system_ai.save(db, config, actor.id, seen)
    with transaction() as db:
        return system_ai.view(db)


@router.post("/system-ai/models", response_model=SystemAIModelsView)
async def list_system_ai_models(body: SystemAIModelsInput, request: Request) -> SystemAIModelsView:
    """The models the form's service offers (spec P40); a blank key lists with the saved one."""
    draft = system_ai.check_source(body)
    with transaction() as db:
        service.admin_account(db, request, mutation=True)
        owner_id, stored, _ = system_ai.current(db)
    config = system_ai.with_key(draft, stored)
    return SystemAIModelsView(models=await system_ai.models(config, owner_id))


# ---- 報表：從紀錄算，不呼叫模型；days＝往回看幾天 ----


@router.get("/reports/eval", response_model=EvalReportView, response_model_by_alias=True)
def get_eval_report(request: Request, days: int = Query(7, ge=1, le=90)) -> EvalReportView:
    with transaction() as db:
        service.admin_account(db, request)
        return reports.eval_report(db, days)


@router.get("/reports/voice", response_model=VoiceReportView)
def get_voice_report(request: Request, days: int = Query(7, ge=1, le=90)) -> VoiceReportView:
    with transaction() as db:
        service.admin_account(db, request)
        return reports.voice_report(db, days)
