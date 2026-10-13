"""Shared application services owned by Group Dialogue."""

from typing import Any, Iterable, cast

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.platform.errors import DomainError
from app.repositories.classroom_storage import Membership, digest
from app.services import classroom as classroom_service


def actor(db: Session, request: Request, mutation: bool = False) -> Any:
    # Resolve the already-initialised native adapter lazily to preserve imports.
    from app.modules.identity_access.dependencies import account

    return account(db, request, mutation)[0]


def roster(db: Session, room: Any) -> list[Membership]:
    return list(
        db.scalars(
            select(Membership)
            .where(Membership.room_id == room.id, Membership.role == "student")
            .order_by(Membership.seat, Membership.id)
        )
    )


def roster_hash(rows: Iterable[Membership]) -> str:
    return cast(str, digest([{"id": r.id, "alias": r.alias, "seat": r.seat} for r in rows]))


def teacher_room(db: Session, rid: str, a: Any) -> Any:
    room, _, teacher = classroom_service.load(db, rid, a.id, True)
    if not teacher:
        raise DomainError("TEACHER_MEMBERSHIP_REQUIRED", 403)
    if room.state.get("group"):
        raise DomainError("CLASSROOM_PARENT_REQUIRED", 422)
    return room
