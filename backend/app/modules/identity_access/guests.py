"""Guests' records across modules, and expiring guests 168 hours after they joined.

identity-access cannot import the modules that keep a guest's records, so each of them registers
a GuestRecordHook here; the app shell wires them, as it does account view extensions.
"""

import logging
import time

from sqlalchemy import delete, select

from app.modules.identity_access.contracts import GuestRecordHook
from app.modules.identity_access.repositories import Account, LoginSession
from app.modules.platform.storage import transaction

logger = logging.getLogger(__name__)
GUEST_HOOKS: dict[str, GuestRecordHook] = {}


def register_guest_hook(module: str, hook: GuestRecordHook) -> None:
    GUEST_HOOKS[module] = hook


def expire_guests(now: float | None = None) -> list[str]:
    """Every guest past guest_expires_at: each module forgets the guest's name, the account's
    name is cleared, its sessions end, and it becomes an expired_guest. The account row and its
    records stay.

    One transaction per guest, so a guest whose hook fails stays for the next run without
    holding back the others. Returns the ids expired.
    """
    now = time.time() if now is None else now
    with transaction() as db:
        due = db.scalars(
            select(Account.id).where(Account.kind == "guest", Account.guest_expires_at <= now)
        ).all()
    expired = []
    for guest_id in due:
        try:
            with transaction() as db:
                account = db.get(Account, guest_id, with_for_update=True)
                # Registered since the list was read.
                if account is None or account.kind != "guest":
                    continue
                for hook in GUEST_HOOKS.values():
                    hook.forget_name(db, guest_id)
                # The username column is unique and required, so the nickname gives way to a
                # placeholder built from the id; nothing a person typed is left.
                account.username = f"expired-guest-{guest_id}"
                account.kind = "expired_guest"
                db.execute(delete(LoginSession).where(LoginSession.account_id == guest_id))
            expired.append(guest_id)
        except Exception:
            logger.exception("guest %s did not expire; the next run retries it", guest_id)
    return expired
