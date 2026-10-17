"""Application services owned by Classroom Core."""

from sqlalchemy import select
from sqlalchemy.orm import Session
from app.modules.platform.errors import DomainError
from app.repositories.classroom_storage import Membership, Room


def load(
    db: Session, room_id: str, account_id: str, locked: bool = False
) -> tuple[Room, Membership | None, bool]:
    query = select(Room).where(Room.id == room_id)
    if locked:
        query = query.with_for_update()
    room = db.scalar(query)
    if room is None:
        raise DomainError("CLASSROOM_REQUIRED", 404)
    member = db.scalar(
        select(Membership).where(
            Membership.room_id == room_id,
            Membership.account_id == account_id,
            Membership.role == "student",
        )
    )
    teacher = room.creator_id == account_id
    if not teacher and member is None:
        raise DomainError("CLASSROOM_MEMBERSHIP_REQUIRED", 403)
    return room, member, teacher
