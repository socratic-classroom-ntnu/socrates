"""Account deletion: who may delete, and what deleting does to the account.

identity-access cannot import the modules that keep things tied to an account (courses, AI
connections), so each of them registers an AccountRecordHook here; the app shell wires them, as it
does the guest record hooks.
"""

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.modules.identity_access import avatar
from app.modules.identity_access.contracts import AccountRecordHook
from app.modules.identity_access.guests import GUEST_HOOKS
from app.modules.identity_access.repositories import (
    Account,
    EmailToken,
    LoginSession,
    Mail,
    MailDelivery,
)
from app.modules.platform.errors import DomainError

ACCOUNT_HOOKS: dict[str, AccountRecordHook] = {}


def register_account_hook(module: str, hook: AccountRecordHook) -> None:
    ACCOUNT_HOOKS[module] = hook


def registered_account_hooks() -> set[str]:
    """The modules whose account record hooks are registered now."""
    return set(ACCOUNT_HOOKS)


def owned_courses(db: Session, account_id: str) -> list[str]:
    """The names of what keeps this account from being deleted: the courses it teaches."""
    return [
        name for hook in ACCOUNT_HOOKS.values() for name in hook.blocking_courses(db, account_id)
    ]


def ensure_account_can_be_deleted(db: Session, account: Account) -> None:
    if account.kind != "registered":
        raise DomainError("ACCOUNT_DELETE_UNAVAILABLE", 403)
    if owned_courses(db, account.id):
        raise DomainError("ACCOUNT_HAS_COURSES", 409)


def forget_sessions(db: Session, token_hashes: list[str]) -> None:
    """End these login sessions; what other modules bound to them goes first (foreign keys)."""
    if not token_hashes:
        return
    for hook in ACCOUNT_HOOKS.values():
        hook.forget_sessions(db, token_hashes)
    db.execute(delete(LoginSession).where(LoginSession.token_hash.in_(token_hashes)))


def sign_out_other_sessions(db: Session, account_id: str, keep: str) -> None:
    """End every login session of the account except ``keep`` (after a password change)."""
    forget_sessions(
        db,
        list(
            db.scalars(
                select(LoginSession.token_hash).where(
                    LoginSession.account_id == account_id, LoginSession.token_hash != keep
                )
            )
        ),
    )


def anonymize_account_mail(db: Session, account_id: str) -> None:
    """Cancel queued mail and remove stored personal mail content."""
    rows = db.execute(
        select(Mail, MailDelivery)
        .join(MailDelivery, MailDelivery.mail_id == Mail.id)
        .where(MailDelivery.account_id == account_id)
        .order_by(Mail.id)
        .with_for_update(of=Mail)
    ).all()

    for mail, delivery in rows:
        # A sent email cannot be recalled: keep its delivery state, remove its content.
        if mail.state != "SENT":
            mail.state = "CANCELLED"
            delivery.provider_status = "CANCELLED"

        mail.recipient = "deleted@invalid.invalid"
        mail.subject = "ACCOUNT_DELETED"
        mail.body = "REDACTED"

        delivery.account_id = None
        delivery.html_body = None
        delivery.preview_url = None
        delivery.lease = None
        delivery.lease_until = 0
        delivery.last_error = None
        delivery.events = []


def anonymize_account(db: Session, account: Account) -> None:
    """Anonymize the account inside the caller's transaction; its records stay."""
    ensure_account_can_be_deleted(db, account)

    account_id = account.id
    avatar.remove(db, account_id)

    # Keep learning records, but remove stored roster names.
    for guest_hook in GUEST_HOOKS.values():
        guest_hook.forget_name(db, account_id)
    for account_hook in ACCOUNT_HOOKS.values():
        account_hook.forget_account(db, account_id)

    anonymize_account_mail(db, account_id)
    db.execute(delete(EmailToken).where(EmailToken.account_id == account_id))
    forget_sessions(
        db,
        list(
            db.scalars(select(LoginSession.token_hash).where(LoginSession.account_id == account_id))
        ),
    )

    # Anonymize the account, but keep its primary key.
    account.username = f"deleted-{account_id}"
    account.email = None
    account.password_hash = None
    account.display_name_override = None
    account.verified = False
    account.platform_role = None
    account.kind = "deleted"
    account.guest_expires_at = None
