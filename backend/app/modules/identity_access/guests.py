"""Guests' records across modules, and deleting guests once they have been idle for 7 days.

identity-access cannot import the modules that keep a guest's records, so each of them registers
a GuestRecordHook here; the app shell wires them, as it does account view extensions.
"""

import logging
import time

from sqlalchemy import delete, select

from app.modules.identity_access.contracts import GuestRecordHook
from app.modules.identity_access.repositories import Account, EmailToken, LoginSession
from app.modules.platform.storage import transaction

logger = logging.getLogger(__name__)
GUEST_HOOKS: dict[str, GuestRecordHook] = {}


def register_guest_hook(module: str, hook: GuestRecordHook) -> None:
    GUEST_HOOKS[module] = hook


def delete_expired_guests(now: float | None = None) -> list[str]:
    """Every guest idle past guest_expires_at: each module's records first, then the account.

    One transaction per guest, so a guest whose records fail to delete stays for the next run
    without holding back the others. Returns the ids deleted.
    """
    now = time.time() if now is None else now
    with transaction() as db:
        expired = db.scalars(
            select(Account.id).where(Account.kind == "guest", Account.guest_expires_at <= now)
        ).all()
    deleted = []
    for guest_id in expired:
        try:
            with transaction() as db:
                account = db.get(Account, guest_id, with_for_update=True)
                # Acted or registered since the list was read.
                if account is None or account.kind != "guest":
                    continue
                if (account.guest_expires_at or 0) > now:
                    continue
                for hook in GUEST_HOOKS.values():
                    hook.delete(db, guest_id)
                db.execute(delete(LoginSession).where(LoginSession.account_id == guest_id))
                db.execute(delete(EmailToken).where(EmailToken.account_id == guest_id))
                db.delete(account)
            deleted.append(guest_id)
        except Exception:
            logger.exception("guest %s was not deleted; the next run retries it", guest_id)
    return deleted
