"""The teacher's AI 連線設定 under /ai-settings/connection (teacher accounts only).

The URL check (DNS) and every provider call run between two transactions, never inside one.
"""

from fastapi import APIRouter, Request

from app.modules.ai_connection import connection
from app.modules.ai_connection import service as checks
from app.modules.ai_connection.contracts import (
    AIConnectionInput,
    AIConnectionModeInput,
    AIConnectionTestView,
    AIConnectionView,
)
from app.modules.identity_access.service import account
from app.modules.platform.storage import transaction

router = APIRouter(prefix="/ai-settings/connection", tags=["ai-connection"])


def _teacher(db, request: Request, *, mutation: bool) -> str:
    current, _ = account(db, request, mutation)
    connection.require_teacher(current)
    return current.id


@router.get("", response_model=AIConnectionView)
def get_connection(request: Request) -> AIConnectionView:
    with transaction() as db:
        return connection.view(db, _teacher(db, request, mutation=False))


@router.post("/test", response_model=AIConnectionTestView)
async def test_connection(body: AIConnectionInput, request: Request) -> AIConnectionTestView:
    """Test only; nothing is saved."""
    with transaction() as db:
        owner_id = _teacher(db, request, mutation=True)
        stored = connection.current(db, owner_id).stored
    form = connection.check_form(body)
    await checks.probe(
        checks.with_key(form.draft, stored, prefix=connection.PREFIX),
        owner_id,
        prefix=connection.PREFIX,
    )
    return AIConnectionTestView()


@router.put("", response_model=AIConnectionView)
async def put_connection(body: AIConnectionInput, request: Request) -> AIConnectionView:
    """Test, and save only when the test passes; a failure leaves the connection as it was."""
    with transaction() as db:
        owner_id = _teacher(db, request, mutation=True)
        form = connection.check_form(body)
        before = connection.current(db, owner_id)
        connection.check_name_free(db, owner_id, form, before.kept_row(form.draft))
    config = await checks.probe(
        checks.with_key(form.draft, before.stored, prefix=connection.PREFIX),
        owner_id,
        prefix=connection.PREFIX,
    )
    with transaction() as db:
        # Checked again: the account is read anew after the test.
        _teacher(db, request, mutation=True)
        connection.save(db, owner_id, form, config, before.seen)
    with transaction() as db:
        return connection.view(db, owner_id)


@router.put("/mode", response_model=AIConnectionView)
def put_mode(body: AIConnectionModeInput, request: Request) -> AIConnectionView:
    """Switch between 系統提供 and the teacher's kept connection; nothing is sent to a provider."""
    with transaction() as db:
        owner_id = _teacher(db, request, mutation=True)
        connection.switch(db, owner_id, body.mode)
    with transaction() as db:
        return connection.view(db, owner_id)
