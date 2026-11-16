"""solo-activity's enrollment record hook (course_management.contracts.EnrollmentRecordHook).

Removing a student from a course deletes their attempts, and the messages with them, in every
activity of that course, soft-deleted activities included. The attempts are locked first: a
student action holding one finishes (and commits its new message) before the delete, so no
message is left pointing at a deleted attempt.
"""

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.modules.course_management.repositories import Activity
from app.modules.solo_activity.repositories import SoloAttempt, SoloMessage


class SoloEnrollmentRecords:
    def remove(self, db: Session, course_id: str, account_id: str) -> None:
        in_course = select(Activity.id).where(Activity.course_id == course_id)
        ids = list(
            db.scalars(
                select(SoloAttempt.id)
                .where(SoloAttempt.activity_id.in_(in_course), SoloAttempt.account_id == account_id)
                .order_by(SoloAttempt.id)
                .with_for_update()
            )
        )
        if not ids:
            return
        db.execute(delete(SoloMessage).where(SoloMessage.attempt_id.in_(ids)))
        db.execute(delete(SoloAttempt).where(SoloAttempt.id.in_(ids)))
        db.flush()


HOOK = SoloEnrollmentRecords()
