import uuid
from typing import Annotated, Iterator

from fastapi import Depends, Header
from sqlalchemy.orm import Session as OrmSession

from app.config import settings
from app.db import SessionLocal
from app.services.conversation import ConversationService
from app.tutor.gateway import TutorGateway
from app.tutor.scripted import ScriptedProvider


def get_db() -> Iterator[OrmSession]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_learner_id(x_learner_id: Annotated[uuid.UUID, Header()]) -> uuid.UUID:
    """不是真的安全機制，但它是第二輪換成真認證時唯一要改的地方。"""
    return x_learner_id


def get_service(db: Annotated[OrmSession, Depends(get_db)]) -> ConversationService:
    import app.main as main

    gateway = TutorGateway(ScriptedProvider.load(settings.script_path))
    return ConversationService(db, main.ladder_repository, gateway)
