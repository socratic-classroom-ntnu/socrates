"""Guests in solo activities: how the teacher's views name them, and solo-activity's guest record
hook (identity_access.contracts.GuestRecordHook).

An expired guest is shown as 匿名訪客 N. N counts only the expired guests of the course, in the
order they joined it (enrollment time, then enrollment id); it is worked out on every read and
never stored, so sorting a view differently never renumbers anyone. A guest past
guest_expires_at is expired already, before the daily job marks it.
"""

from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.modules.course_management.repositories import Enrollment
from app.modules.identity_access.repositories import Account
from app.modules.solo_activity.repositories import SoloAttempt, SoloMessage


def student_kinds(db: Session, enrolled: list[Enrollment], at: float) -> dict[str, dict[str, Any]]:
    """kind and guest_number for each enrollment; ``enrolled`` is every student of the course in
    joining order (created_at, id), so the numbers are the course's, whatever a view lists."""
    ids = {row.account_id for row in enrolled}
    accounts = {
        account.id: account for account in db.scalars(select(Account).where(Account.id.in_(ids)))
    }
    kinds: dict[str, dict[str, Any]] = {}
    number = 0
    for row in enrolled:
        account = accounts.get(row.account_id)
        kind = account.kind if account is not None else "registered"
        if account is not None and kind == "guest" and (account.guest_expires_at or 0) <= at:
            kind = "expired_guest"
        guest_number = None
        if kind == "expired_guest":
            number += 1
            guest_number = number
        kinds[row.id] = {"kind": kind, "guest_number": guest_number}
    return kinds


class SoloGuestRecords:
    def reassign(self, db: Session, guest_id: str, account_id: str) -> None:
        """Move the guest's attempts, messages with them; in an activity both have answered,
        the account's attempt stays and the guest's is deleted."""
        taken = set(
            db.scalars(select(SoloAttempt.activity_id).where(SoloAttempt.account_id == account_id))
        )
        for row in db.scalars(select(SoloAttempt).where(SoloAttempt.account_id == guest_id)):
            if row.activity_id in taken:
                db.execute(delete(SoloMessage).where(SoloMessage.attempt_id == row.id))
                db.delete(row)
            else:
                row.account_id = account_id
        db.flush()

    def forget_name(self, db: Session, guest_id: str) -> None:
        """solo-activity stores no name: the course's enrollment holds it."""


HOOK = SoloGuestRecords()
