"""後台「系統 AI」: the form checks, the test and the model list live in `ai_connection.service`
(shared with the teacher's AI 連線設定); this page answers with its own `SYSTEM_AI_*` codes.
Reading and saving the system account's connection stays here.
"""

from sqlalchemy.orm import Session

from app.modules.admin.contracts import (
    AdminAuthor,
    DeployAuthor,
    ModelOption,
    SystemAIInput,
    SystemAIModelsInput,
    SystemAIView,
)
from app.modules.ai_connection import service as connection
from app.modules.ai_providers import service as ai_service
from app.modules.course_management import service as course_service
from app.modules.identity_access.repositories import Account
from app.modules.platform.errors import DomainError
from app.modules.platform.toggles import toggle_enabled

PREFIX = "SYSTEM_AI"


def check_fields(body: SystemAIInput) -> connection.Draft:
    return connection.check_fields(
        body.adapter, body.model, body.api_key, body.base_url, prefix=PREFIX
    )


def check_source(body: SystemAIInput | SystemAIModelsInput) -> connection.Draft:
    return connection.check_source(body.adapter, body.api_key, body.base_url, prefix=PREFIX)


def with_key(
    draft: connection.Draft, stored: ai_service.PlatformConfig | None
) -> ai_service.PlatformConfig:
    return connection.with_key(draft, stored, prefix=PREFIX)


def check_base_url(config: ai_service.PlatformConfig) -> ai_service.PlatformConfig:
    return connection.check_base_url(config, prefix=PREFIX)


async def probe(config: ai_service.PlatformConfig, owner_id: str) -> ai_service.PlatformConfig:
    return await connection.probe(config, owner_id, prefix=PREFIX)


async def models(config: ai_service.PlatformConfig, owner_id: str) -> list[ModelOption]:
    return await connection.models(config, owner_id, prefix=PREFIX)


# ---- 讀取與寫入（transaction 內）：provider 呼叫一律在兩段 transaction 之間 ----


def snapshot(db: Session) -> float | None:
    """When the connection was last written; compared again under the lock before saving."""
    row = ai_service.platform_profile(db, course_service.practice_owner(db).id)
    return row.updated_at if row is not None else None


def current(db: Session) -> tuple[str, ai_service.PlatformConfig | None, float | None]:
    """The system account, the saved connection (for a blank form key) and the snapshot."""
    owner_id = course_service.practice_owner(db).id
    return owner_id, ai_service.usable_platform_config(db, owner_id), snapshot(db)


def save(db: Session, config: ai_service.PlatformConfig, actor_id: str, seen: float | None) -> None:
    """Write a tested connection unless someone wrote it since `seen`: the other
    admin's save, or a startup import, wins over a form tested against the older one."""
    owner = course_service.lock_practice_owner(db)
    row = ai_service.platform_profile(db, owner.id)
    if (row.updated_at if row is not None else None) != seen:
        raise DomainError("SYSTEM_AI_CHANGED", 409)
    ai_service.save_platform_profile(db, owner.id, config, actor_id)


def view(db: Session) -> SystemAIView:
    fallback = toggle_enabled(db, "system_ai_fallback")
    row = ai_service.usable_platform_profile(db, course_service.practice_owner(db).id)
    if row is None:
        return SystemAIView(
            configured=False,
            adapter=None,
            model=None,
            base_url=None,
            key_last4=None,
            updated_at=None,
            updated_by=None,
            fallback_enabled=fallback,
        )
    author = ai_service.platform_author(row)
    by: AdminAuthor | DeployAuthor = DeployAuthor()
    if author != ai_service.DEPLOY_AUTHOR:
        account = db.get(Account, author)
        by = AdminAuthor(name=account.username if account is not None else "—")
    return SystemAIView(
        configured=True,
        adapter=row.adapter,
        model=row.default_model,
        base_url=row.base_url,
        key_last4=row.secret_last4,
        updated_at=row.updated_at,
        updated_by=by,
        fallback_enabled=fallback,
    )
