"""後台：功能開關與平台管理員（spec P3–P7、P15、P23–P25）。

Anyone who is not an admin, signed out and guests included, gets ADMIN_NOT_FOUND, as if the 後台
did not exist; only a wrong CSRF token on a write keeps its own 403.
"""

import os
import time

from fastapi import Request
from sqlalchemy.orm import Session

from app.modules.admin.contracts import AdminView, ToggleView
from app.modules.identity_access import service as identity
from app.modules.identity_access.repositories import Account
from app.modules.platform.errors import DomainError
from app.modules.platform import toggles
from app.modules.platform.storage import transaction

# 內建管理員：每個環境（本機、dev、QA、預覽、正式）啟動時都會有的同一個管理員，不必請叢集設環境變數。
# repo 是公開的，這裡只放 argon2id 雜湊；密碼是隨機產生的，由專案負責人保管。
# 換密碼就換這裡的雜湊（已經建好的帳號保留原本的密碼）。
BUILTIN_ADMIN_USERNAME = "socrates-admin"
BUILTIN_ADMIN_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$Owgmfe3mPQmvN+3QK/VFgg$oKpxsuAMqcg6Eh6+NNrKIkMqlxZwph4MY19Os6fWS88"


def admin_account(db: Session, request: Request, mutation: bool = False) -> Account:
    try:
        account, _ = identity.account(db, request, mutation=mutation)
    except DomainError as error:
        if error.code == "SESSION_CSRF_REQUIRED":
            raise
        raise DomainError("ADMIN_NOT_FOUND", 404) from None
    if not identity.is_admin(account):
        raise DomainError("ADMIN_NOT_FOUND", 404)
    return account


def admin_guard(request: Request) -> None:
    """Router dependency: runs before FastAPI validates the body or query, so an invalid request
    from someone who is not an admin still gets ADMIN_NOT_FOUND instead of a 422 (spec P15)."""
    with transaction() as db:
        admin_account(db, request)
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            admin_account(db, request, mutation=True)


def _name(db: Session, account_id: str | None) -> str | None:
    if not account_id:
        return None
    account = db.get(Account, account_id)
    return account.username if account is not None else None


def toggle_views(db: Session) -> list[ToggleView]:
    return [
        ToggleView(
            key=key,
            name=spec.name,
            description=spec.description,
            enabled=row.enabled if row is not None else spec.default,
            updated_at=row.updated_at if row is not None else None,
            updated_by_name=_name(db, row.updated_by) if row is not None else None,
            disable_warning=spec.disable_warning,
        )
        for key, spec, row in toggles.toggle_rows(db)
    ]


def update_toggle(db: Session, actor: Account, key: str, enabled: bool) -> ToggleView:
    if key not in toggles.DB_TOGGLES:
        raise DomainError("ADMIN_TOGGLE_NOT_FOUND", 404)
    toggles.set_toggle(db, key, enabled, actor.id, time.time())
    return next(view for view in toggle_views(db) if view.key == key)


def admin_view(account: Account, actor: Account) -> AdminView:
    return AdminView(
        account_id=account.id,
        username=account.username,
        display_name=identity.display_name(account),
        account_role=account.account_role,
        is_you=account.id == actor.id,
    )


def admin_views(db: Session, actor: Account) -> list[AdminView]:
    return [admin_view(account, actor) for account in identity.list_admins(db)]


def ensure_builtin_admin(db: Session) -> bool:
    """The same admin account in every environment, created at startup when its username is free."""
    return identity.ensure_builtin_admin(db, BUILTIN_ADMIN_USERNAME, BUILTIN_ADMIN_PASSWORD_HASH)


def bootstrap_from_env(db: Session) -> int:
    """First admins from SOCRATES_BOOTSTRAP_ADMINS, only while nobody is an admin (spec P3)."""
    raw = os.environ.get("SOCRATES_BOOTSTRAP_ADMINS", "")
    names = [name for name in raw.split(",") if name.strip()]
    return identity.bootstrap_admins(db, names) if names else 0
