"""A teacher's AI 連線設定: what is in use, and the 系統 AI they can choose instead."""

from sqlalchemy.orm import Session

from app.modules.ai_connection.contracts import ConnectionView, OwnConnectionView, SystemOptionView
from app.modules.ai_providers import service as ai_service
from app.modules.course_management import service as course_service
from app.modules.identity_access.repositories import Account
from app.modules.platform.errors import DomainError
from app.modules.platform.toggles import toggle_enabled


def require_teacher(account: Account) -> None:
    if account.account_role != "teacher":
        raise DomainError("ACCOUNT_ROLE_FORBIDDEN", 403)


def system_option(db: Session) -> SystemOptionView:
    """The 系統 AI not set up counts as the switch off (需求〈系統提供和自己的金鑰〉)."""
    row = ai_service.usable_platform_profile(db, course_service.practice_owner(db).id)
    if row is None:
        return SystemOptionView(available=False, model=None)
    return SystemOptionView(
        available=toggle_enabled(db, "system_ai_fallback"), model=row.default_model
    )


def view(db: Session, owner_id: str) -> ConnectionView:
    own = ai_service.owner_connection(db, owner_id)
    return ConnectionView(
        mode="own" if own is not None and own.enabled else "system",
        system=system_option(db),
        own=None
        if own is None
        else OwnConnectionView(
            adapter=own.adapter,
            model=own.model,
            base_url=own.base_url,
            name=own.name,
            key_last4=own.key_last4,
            enabled=own.enabled,
            key_usable=own.key_usable,
        ),
    )
