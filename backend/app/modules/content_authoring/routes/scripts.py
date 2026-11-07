"""Script endpoints: the teacher's question scripts (CRUD, YAML import and export)."""

from fastapi import APIRouter

import yaml
from fastapi import HTTPException, Request, Response
from pydantic import ValidationError
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool
from app.modules.identity_access.service import account
from app.modules.content_authoring.contracts import (
    ScriptDocument,
    ScriptSave,
    ScriptView,
)
from app.modules.platform.errors import DomainError
from app.modules.content_authoring.repositories import Script
from app.modules.platform.storage import transaction
from app.modules.content_authoring.service import validate_scenario_ai

router = APIRouter()


@router.get("/scripts", response_model=list[ScriptView])
def scripts(request: Request):
    with transaction() as db:
        a, _ = account(db, request)
        return [
            {"id": s.id, "revision": s.revision, "document": s.document}
            for s in db.scalars(select(Script).where(Script.owner_id == a.id))
        ]


@router.post("/scripts")
def create_script(body: ScriptSave, request: Request):
    with transaction() as db:
        a, _ = account(db, request, True)
        document = body.document.model_dump()
        validate_scenario_ai(db, a.id, document)
        s = Script(owner_id=a.id, document=document)
        db.add(s)
        db.flush()
        return {"id": s.id, "revision": s.revision, "document": s.document}


@router.put("/scripts/{script_id}")
def update_script(script_id: str, body: ScriptSave, request: Request):
    with transaction() as db:
        a, _ = account(db, request, True)
        s = db.scalar(select(Script).where(Script.id == script_id).with_for_update())
        if s is None or s.owner_id != a.id:
            raise DomainError("SCRIPT_OWNER_REQUIRED", 403)
        if body.expected_revision != s.revision:
            raise DomainError("請讀取新版劇本後合併編輯。")
        document = body.document.model_dump()
        validate_scenario_ai(db, a.id, document)
        s.document = document
        s.revision += 1
        return {"id": s.id, "revision": s.revision, "document": s.document}


@router.post("/scripts/import")
async def import_script(request: Request):
    raw = await request.body()
    if len(raw) > 256 * 1024:
        raise DomainError("YAML 內容最多 256 KB。", 413)
    if not raw.strip():
        raise DomainError("請貼上 YAML 內容。", 422)

    try:
        value = yaml.safe_load(raw)
    except yaml.YAMLError as exc:
        mark = getattr(exc, "problem_mark", None)
        location = f"第 {mark.line + 1} 行、第 {mark.column + 1} 欄：" if mark is not None else ""
        problem = getattr(exc, "problem", None) or "語法格式不符"
        raise DomainError(f"YAML 格式錯誤：{location}{problem}", 422) from exc

    try:
        doc = ScriptDocument.model_validate(value)
    except ValidationError as exc:
        detail = []
        for item in exc.errors(include_url=False, include_input=False):
            ctx = item.get("ctx")
            if isinstance(ctx, dict):
                item["ctx"] = {
                    key: current
                    if current is None or isinstance(current, (str, int, float, bool))
                    else str(current)
                    for key, current in ctx.items()
                }
            detail.append(item)
        raise HTTPException(status_code=422, detail=detail) from exc

    return await run_in_threadpool(create_script, ScriptSave(document=doc), request)


@router.get("/scripts/{script_id}/yaml")
def export_yaml(script_id: str, request: Request):
    with transaction() as db:
        a, _ = account(db, request)
        s = db.get(Script, script_id)
        if s is None or s.owner_id != a.id:
            raise DomainError("SCRIPT_OWNER_REQUIRED", 403)
        return Response(
            yaml.safe_dump(s.document, allow_unicode=True, sort_keys=False),
            media_type="application/yaml",
        )
