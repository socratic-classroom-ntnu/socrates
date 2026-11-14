"""Course-management's guest record hook (identity_access.contracts.GuestRecordHook).

A guest's records here are its enrollments. Logging in moves them to the account; when both are
in the same course the account's enrollment stays and the guest's is deleted. When the guest
expires its name in each course is cleared; the enrollment stays, so teacher statistics still
count it, and the teacher's views show it as 匿名訪客 N by its kind.
"""

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.modules.course_management.repositories import Enrollment


class CourseGuestRecords:
    def reassign(self, db: Session, guest_id: str, account_id: str) -> None:
        taken = set(
            db.scalars(select(Enrollment.course_id).where(Enrollment.account_id == account_id))
        )
        for row in db.scalars(select(Enrollment).where(Enrollment.account_id == guest_id)):
            if row.course_id in taken:
                db.delete(row)
            else:
                row.account_id = account_id
        db.flush()

    def forget_name(self, db: Session, guest_id: str) -> None:
        # display_name is required, so the name becomes empty rather than null.
        db.execute(
            update(Enrollment).where(Enrollment.account_id == guest_id).values(display_name="")
        )


HOOK = CourseGuestRecords()
