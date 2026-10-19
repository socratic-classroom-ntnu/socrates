"""Long-lived teacher Classroom assets, immutable Lessons, and linked Group Sessions."""

from fastapi import APIRouter, Request
from sqlalchemy import select

from app.modules.classroom_core.contracts import LibraryClassroomView
from app.modules.classroom_core.service import (
    link_group_session as link_group_session,
    owned_classroom as owned,
)
from app.modules.content_authoring.service import mutate as mutate
from app.modules.classroom_core.repositories import ClassroomAssets
from app.modules.platform.storage import transaction
from app.modules.ai_providers.contracts import SettingsUpdate
from app.modules.ai_providers.service import (
    account_from_request,
    classroom_settings_view,
)
from app.modules.classroom_core.contracts import AttachScript, CreateBatch, CreateClassroom
from app.modules.classroom_core.service import user
from app.modules.classroom_core.service import (
    create_library_classroom,
    library_classroom_view,
    attach_classroom_script,
    create_classroom_batch,
    update_classroom_ai_settings,
)


router = APIRouter(prefix="/library")


@router.get("/classrooms", response_model=list[LibraryClassroomView])
def list_classrooms(request: Request):
    with transaction() as db:
        account = user(db, request)
        return [
            {"id": row.id, "title": row.title, "revision": row.revision}
            for row in db.scalars(
                select(ClassroomAssets)
                .where(ClassroomAssets.owner_id == account.id)
                .order_by(ClassroomAssets.created_at.desc())
            )
        ]


@router.post("/classrooms")
def create_classroom(body: CreateClassroom, request: Request):
    with transaction() as db:
        account = user(db, request, True)
        return create_library_classroom(db, account, body)


@router.get("/classrooms/{cid}")
def classroom(cid: str, request: Request):
    with transaction() as db:
        account = user(db, request)
        return library_classroom_view(db, account, cid)


@router.post("/classrooms/{cid}/scripts")
def attach_script(cid: str, body: AttachScript, request: Request):
    with transaction() as db:
        account = user(db, request, True)
        return attach_classroom_script(db, account, cid, body)


@router.post("/classrooms/{cid}/batches")
def create_batch(cid: str, body: CreateBatch, request: Request):
    with transaction() as db:
        account = user(db, request, True)
        return create_classroom_batch(db, account, cid, body)


@router.get("/classrooms/{cid}/ai-settings")
def classroom_settings(cid: str, request: Request):
    with transaction() as db:
        account, _ = account_from_request(db, request)
        classroom = owned(db, cid, account)
        return classroom_settings_view(classroom.assets.get("ai_settings"))


@router.put("/classrooms/{cid}/ai-settings")
def update_classroom_settings(cid: str, body: SettingsUpdate, request: Request):
    with transaction() as db:
        account, session = account_from_request(db, request, True)
        return update_classroom_ai_settings(db, account, session, cid, body)
