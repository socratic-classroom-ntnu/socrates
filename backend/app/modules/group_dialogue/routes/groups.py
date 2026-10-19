"""GroupRun HTTP adapters on the native classroom authentication and persistence layer."""

from fastapi import APIRouter, Request

from app.modules.platform.storage import transaction
from app.modules.platform.errors import DomainError
from app.modules.group_dialogue.service import actor
from app.modules.group_dialogue.group_run import (
    PERSONAL_COMMANDS,
)
from app.modules.classroom_core import service as service
from app.modules.group_dialogue.contracts import Configure, GroupCommand, Start
from app.modules.group_dialogue.service import (
    configure_groups,
    start_groups,
    run_group_command,
    reveal_member_identity,
)
from app.modules.group_dialogue.service import group_classroom_view

router = APIRouter(prefix="/groups")


@router.post("/classrooms/{rid}/configure")
def configure(rid: str, body: Configure, request: Request):
    with transaction() as db:
        a = actor(db, request, True)
        return configure_groups(db, a, rid, body)


@router.post("/classrooms/{rid}/start")
def start(rid: str, body: Start, request: Request):
    with transaction() as db:
        a = actor(db, request, True)
        return start_groups(db, a, rid, body)


@router.get("/classrooms/{rid}")
def view(rid: str, request: Request):
    requested_mode = request.query_params.get("mode")
    with transaction() as db:
        a = actor(db, request)
        return group_classroom_view(db, a, rid, requested_mode)


@router.post("/runs/{rid}/commands")
def command(rid: str, body: GroupCommand, request: Request):
    if body.kind not in {"group_statement", "group_ack", "next", *PERSONAL_COMMANDS}:
        raise DomainError("GROUP_COMMAND_REQUIRED", 422)
    with transaction() as db:
        a = actor(db, request, True)
        return run_group_command(db, a, rid, body)


@router.get("/runs/{rid}/members/{mid}/identity")
def identity(rid: str, mid: str, request: Request):
    with transaction() as db:
        a = actor(db, request)
        return reveal_member_identity(db, a, rid, mid)
