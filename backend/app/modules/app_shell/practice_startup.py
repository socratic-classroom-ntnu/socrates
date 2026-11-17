"""Startup for 我的對話 (spec §10 M3, M8): the system account and its platform connection.

`create_app` only validates (bank file, SOCRATES_PRACTICE_LLM_*), so a broken deploy fails before
serving; the database work runs from the lifespan, and tests call `prepare_practice` directly.
"""

from sqlalchemy.orm import Session

from app.modules.ai_providers import service as ai_service
from app.modules.course_management import service as course_service


def prepare_practice(db: Session, config: ai_service.PlatformConfig | None) -> None:
    owner = course_service.practice_owner(db)
    if config is None:
        ai_service.disable_platform_profile(db, owner.id)
    else:
        ai_service.upsert_platform_profile(db, owner.id, config)
