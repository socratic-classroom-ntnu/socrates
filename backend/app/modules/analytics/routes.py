"""Teacher analytics over a grouped classroom (evidence projections, no identities)."""

from fastapi import APIRouter, Request
from app.modules.classroom_core.repositories import (
    Room,
)
from app.modules.platform.storage import transaction
from app.modules.group_dialogue.service import actor, teacher_room
from app.modules.analytics.group_analysis import analysis as project_analysis
from app.modules.analytics.contracts import GroupAnalysisView
from app.modules.analytics import radar
from app.modules.solo_activity.contracts import RadarView

router = APIRouter(prefix="/groups")


# exclude_unset keeps fields that only some nodes or settlement states carry absent, as before.
@router.get(
    "/classrooms/{rid}/analysis",
    response_model=GroupAnalysisView,
    response_model_exclude_unset=True,
)
def analysis(rid: str, request: Request):
    with transaction() as db:
        a = actor(db, request)
        room = teacher_room(db, rid, a)
        cfg = room.state.get("classroom", {})
        groups = [db.get(Room, x["id"]) for x in cfg.get("groups", [])]
        return project_analysis(rid, room.state["title"], [g for g in groups if g])


@router.get("/classrooms/{rid}/questions/{index}/radar", response_model=RadarView)
async def question_radar(rid: str, index: int, request: Request):
    """This question's radar across every group; computed on each read, outside the transaction."""
    with transaction() as db:
        a = actor(db, request)
        room = teacher_room(db, rid, a)
        cfg = room.state.get("classroom", {})
        groups = [db.get(Room, x["id"]) for x in cfg.get("groups", [])]
        prepared = radar.begin_radar(db, a, room, [g for g in groups if g], index)
    return await radar.finish_radar(prepared)
