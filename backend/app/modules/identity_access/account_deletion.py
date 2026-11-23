"""Account deletion: ownership checks and account anonymization."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.course_management.repositories import Course
from app.modules.identity_access.repositories import Account
from app.modules.platform.errors import DomainError
from sqlalchemy import delete, update

from app.modules.ai_providers.repositories import (
    AccountAISettings,
    ProviderProfile,
    SessionProviderSecret,
)
from app.modules.identity_access.guests import GUEST_HOOKS
from app.modules.identity_access.repositories import (
    EmailToken,
    LoginSession,
    Mail,
    MailDelivery,
)

def owned_courses(db: Session, account_id: str) -> list[str]:
    """Return the names of courses owned by this account."""

    return list(
        db.scalars(
            select(Course.name)
            .where(
                Course.owner_id == account_id,
                Course.practice_account_id.is_(None),
            )
            .order_by(Course.created_at, Course.id)
        ).all()
    )


def ensure_account_can_be_deleted(db: Session, account: Account) -> None:
    """Reject deletion if the account owns teaching courses."""

    if account.kind != "registered":
        raise DomainError("ACCOUNT_DELETE_UNAVAILABLE", 403)

    if owned_courses(db, account.id):
        raise DomainError("ACCOUNT_HAS_COURSES", 409)

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
        # A completed email cannot be recalled.
        # Preserve its delivery state, but remove personal content.
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

def anonymize_account(db: Session, account: Account) -> str | None:
    """Anonymize account data inside the caller's transaction.

    Return the previous avatar filename for cleanup after commit.
    """
    ensure_account_can_be_deleted(db, account)

    account_id = account.id
    previous_avatar = account.avatar_filename

    # Keep learning records, but remove stored roster names.
    for hook in GUEST_HOOKS.values():
        hook.forget_name(db, account_id)

    # Delete session-specific AI credentials before sessions.
    session_hashes = select(LoginSession.token_hash).where(
        LoginSession.account_id == account_id
    )

    db.execute(
        delete(SessionProviderSecret).where(
            SessionProviderSecret.session_token_hash.in_(session_hashes)
        )
    )

    # Delete AI settings, preserving provider profile IDs for references.
    db.execute(
        delete(AccountAISettings).where(
            AccountAISettings.owner_id == account_id
        )
    )

    db.execute(
        update(ProviderProfile)
        .where(ProviderProfile.owner_id == account_id)
        .values(
            encrypted_secret=None,
            secret_last4=None,
            enabled=False,
            base_url=None,
            organization=None,
            project=None,
            metadata_json={},
        )
    )
    # Cancel outstanding emails and erase stored mail content.
    anonymize_account_mail(db, account_id)
    
    # Remove account authentication tokens.
    db.execute(
        delete(EmailToken).where(
            EmailToken.account_id == account_id
        )
    )
    db.execute(
        delete(LoginSession).where(
            LoginSession.account_id == account_id
        )
    )

    # Anonymize the account, but keep its primary key.
    account.username = f"deleted-{account_id}"
    account.email = None
    account.password_hash = None
    account.display_name_override = None
    account.avatar_filename = None
    account.verified = False
    account.platform_role = None
    account.kind = "deleted"
    account.guest_expires_at = None

    return previous_avatar