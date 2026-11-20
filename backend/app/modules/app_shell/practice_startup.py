"""Startup for 我的對話 (spec §10 M3, M8; 後台 spec P30): the system account and the 系統 AI.

The database decides. The env (`SOCRATES_PRACTICE_LLM_*`) is read only while the database has
no usable 系統 AI connection, and then only to write the first one; after that the 後台 changes
it, and an emptied env disables nothing. Reading the env may resolve DNS, so it runs between two
short transactions, and the write checks again under the system account's row lock.
"""

from collections.abc import Callable

from sqlalchemy.orm import Session

from app.modules.ai_providers import service as ai_service
from app.modules.course_management import service as course_service
from app.modules.platform.storage import transaction


def needs_env_import(db: Session) -> bool:
    owner = course_service.practice_owner(db)
    return ai_service.usable_platform_profile(db, owner.id) is None


def import_env(db: Session, config: ai_service.PlatformConfig) -> None:
    owner = course_service.lock_practice_owner(db)
    if ai_service.usable_platform_profile(db, owner.id) is None:
        ai_service.save_platform_profile(db, owner.id, config, ai_service.DEPLOY_AUTHOR)


def prepare_practice(read_env: Callable[[], ai_service.PlatformConfig | None]) -> None:
    """Run at startup; `read_env` raises on an invalid setting, which stops the service."""
    with transaction() as db:
        needed = needs_env_import(db)
    if not needed:
        return
    config = read_env()
    if config is None:
        return
    with transaction() as db:
        import_env(db, config)
