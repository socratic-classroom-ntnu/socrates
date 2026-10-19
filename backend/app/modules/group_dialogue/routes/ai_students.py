"""AI-student HTTP routes. Kept apart so the orchestrator never imports provider modules."""

from __future__ import annotations


from fastapi import APIRouter, Request

from app.modules.platform.storage import transaction

from app.modules.platform.feature_flags import require_feature
from app.modules.group_dialogue.contracts import (
    AddAIStudents,
    ClearAIStudents,
    OtherSuggestionRequest,
)
from app.modules.group_dialogue.service import add_ai_students_to_room, clear_ai_students_from_room
from app.modules.group_dialogue.service import suggest_other_option


router = APIRouter()


@router.post("/groups/classrooms/{rid}/ai-students")
def add_ai_students(rid: str, body: AddAIStudents, request: Request):
    from app.modules.group_dialogue.service import actor

    require_feature("ai_students")
    with transaction() as db:
        teacher = actor(db, request, True)
        return add_ai_students_to_room(db, teacher, rid, body)


@router.post("/groups/classrooms/{rid}/ai-students/clear")
def clear_ai_students(rid: str, body: ClearAIStudents, request: Request):
    from app.modules.group_dialogue.service import actor

    require_feature("ai_students")
    with transaction() as db:
        teacher = actor(db, request, True)
        return clear_ai_students_from_room(db, teacher, rid, body)


@router.post("/suggestions/other")
async def other_suggestion(body: OtherSuggestionRequest, request: Request):
    from app.modules.identity_access.service import account

    with transaction() as db:
        actor, session = account(db, request, True)
    return await suggest_other_option(actor, session, body)
