"""Platform admins (後台): who they are, adding and removing them (spec P1–P5, P18, P23).

An admin is a registered, verified account with platform_role "admin"; the role sits beside
account_role and never changes it. Removing locks every admin row first, so two admins removing
each other at once cannot leave nobody: the second finds it is no longer an admin.
"""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.identity_access.repositories import Account
from app.modules.platform.errors import DomainError

ADMIN = "admin"


def is_admin(account: Account) -> bool:
    return account.platform_role == ADMIN


def list_admins(db: Session) -> list[Account]:
    return list(
        db.scalars(select(Account).where(Account.platform_role == ADMIN).order_by(Account.username))
    )


def grant_admin(db: Session, username: str) -> Account:
    name = username.strip().casefold()
    account = db.scalar(select(Account).where(Account.username == name)) if name else None
    if account is None:
        raise DomainError("ADMIN_ACCOUNT_NOT_FOUND", 404)
    if account.kind != "registered":
        raise DomainError("ADMIN_GUEST_NOT_ALLOWED", 422)
    if not account.verified:
        raise DomainError("ADMIN_UNVERIFIED", 422)
    if account.platform_role == ADMIN:
        raise DomainError("ADMIN_ALREADY", 409)
    account.platform_role = ADMIN
    return account


def revoke_admin(db: Session, actor_id: str, account_id: str) -> None:
    locked = {
        row.id: row
        for row in db.scalars(
            select(Account).where(Account.platform_role == ADMIN).with_for_update()
        )
    }
    if actor_id not in locked:
        raise DomainError("ADMIN_NOT_FOUND", 404)
    if account_id == actor_id:
        raise DomainError("ADMIN_CANNOT_REMOVE_SELF", 409)
    target = locked.get(account_id)
    if target is None:
        raise DomainError("ADMIN_ACCOUNT_NOT_FOUND", 404)
    target.platform_role = None


def ensure_builtin_admin(db: Session, username: str, password_hash: str) -> bool:
    """Creates the built-in admin while no account has its username; an existing account, whoever
    registered it and whatever its role now, is never touched. Several workers may start at once:
    the one that loses the race on the unique username leaves the winner's row alone."""
    if db.scalar(select(Account.id).where(Account.username == username)):
        return False
    try:
        with db.begin_nested():
            db.add(
                Account(
                    username=username,
                    password_hash=password_hash,
                    verified=True,
                    account_role="teacher",
                    platform_role=ADMIN,
                )
            )
    except IntegrityError:
        return False
    return True


def bootstrap_admins(db: Session, usernames: list[str]) -> int:
    """Makes the listed verified, registered accounts admins, but only while nobody is one."""
    if db.scalar(select(Account.id).where(Account.platform_role == ADMIN).limit(1)):
        return 0
    names = {name.strip().casefold() for name in usernames if name.strip()}
    granted = 0
    for account in db.scalars(select(Account).where(Account.username.in_(names))):
        if account.kind == "registered" and account.verified:
            account.platform_role = ADMIN
            granted += 1
    return granted
