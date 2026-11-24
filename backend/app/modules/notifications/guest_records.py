from sqlalchemy.orm import Session

from app.modules.notifications.repositories import transfer_guest_reads


class NotificationGuestRecords:
    def reassign(self, db: Session, guest_id: str, account_id: str) -> None:
        transfer_guest_reads(db, guest_id, account_id)

    def forget_name(self, db: Session, guest_id: str) -> None:
        # Receipts contain no names.
        pass


HOOK = NotificationGuestRecords()
