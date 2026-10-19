import uuid
from typing import Annotated, Iterator

from fastapi import Depends, Header
from sqlalchemy.orm import Session as OrmSession

from app.modules.platform.config import settings
from app.modules.content_authoring.service import LadderRepository
from app.modules.platform.db import SessionLocal
from app.modules.solo_dialogue.conversation import ConversationService
from app.modules.solo_dialogue.tutor_gateway import TutorGateway
from app.modules.solo_dialogue.scripted import ScriptedProvider


ladder_repository = LadderRepository.load(settings.ladder_path)


def get_db() -> Iterator[OrmSession]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_learner_id(x_learner_id: Annotated[uuid.UUID, Header()]) -> uuid.UUID:
    """不是真的安全機制，但它是後續版本換成真認證時唯一要改的地方。"""
    return x_learner_id


def get_service(db: Annotated[OrmSession, Depends(get_db)]) -> ConversationService:
    gateway = TutorGateway(ScriptedProvider.load(settings.script_path))
    return ConversationService(db, ladder_repository, gateway)
