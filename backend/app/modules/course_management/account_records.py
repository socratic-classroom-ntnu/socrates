"""Course-management's account record hook (identity_access.contracts.AccountRecordHook).

A teacher who owns a course cannot delete the account: there is no way to delete a course yet.
A student's own 我的對話 course does not count. Enrollments stay when an account is deleted; the
guest record hook's forget_name clears the names.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.course_management.repositories import Course


class CourseAccountRecords:
    def blocking_courses(self, db: Session, account_id: str) -> list[str]:
        return list(
            db.scalars(
                select(Course.name)
                .where(Course.owner_id == account_id, Course.practice_account_id.is_(None))
                .order_by(Course.created_at, Course.id)
            )
        )

    def forget_sessions(self, db: Session, token_hashes: list[str]) -> None:
        pass

    def forget_account(self, db: Session, account_id: str) -> None:
        pass


HOOK = CourseAccountRecords()
