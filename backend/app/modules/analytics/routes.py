"""Teacher analytics over a grouped classroom (evidence projections, no identities)."""

from fastapi import APIRouter, Request
from app.modules.classroom_core.repositories import (
    Room,
)
from app.modules.platform.storage import transaction
from app.modules.group_dialogue.service import actor, teacher_room
from app.modules.analytics.group_analysis import analysis as project_analysis

router = APIRouter(prefix="/groups")


@router.get("/classrooms/{rid}/analysis")
def analysis(rid: str, request: Request):
    with transaction() as db:
        a = actor(db, request)
        room = teacher_room(db, rid, a)
        cfg = room.state.get("classroom", {})
        groups = [db.get(Room, x["id"]) for x in cfg.get("groups", [])]
        return project_analysis(rid, room.state["title"], [g for g in groups if g])
