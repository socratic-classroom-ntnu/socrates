"""Application services owned by Content Authoring."""

from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.content_authoring.repositories import ClassroomAssets, LibraryReceipt, SessionLink
from app.modules.platform.errors import DomainError
from app.repositories.classroom_storage import digest


def owned_classroom(db: Session, cid: str, account: Any, lock: bool = False) -> ClassroomAssets:
    query = select(ClassroomAssets).where(ClassroomAssets.id == cid)
    if lock:
        query = query.with_for_update()
    classroom = db.scalar(query)
    if classroom is None or classroom.owner_id != account.id:
        raise DomainError("CLASSROOM_ASSET_OWNER_REQUIRED", 403)
    return classroom


def mutate(
    db: Session,
    account: Any,
    operation: str,
    body: Any,
    action: Callable[[], Any],
) -> Any:
    key = f"{account.id}:{operation}:{body.action_id}"
    if len(key) > 200:
        raise DomainError("ACTION_SCOPE_REQUIRED", 422)
    hashed = digest(body.model_dump())
    old = db.get(LibraryReceipt, key)
    if old:
        if old.payload_hash != hashed:
            raise DomainError("ACTION_ID_PAYLOAD_CONFLICT", 409)
        return old.response
    result = action()
    db.add(LibraryReceipt(key=key, payload_hash=hashed, response=result))
    db.flush()
    return result


def link_group_session(db: Session, parent: Any, group: Any) -> None:
    cid = parent.state.get("asset_classroom_id")
    if cid and db.get(SessionLink, group.id) is None:
        db.add(
            SessionLink(
                room_id=group.id,
                classroom_id=cid,
                batch_id=parent.id,
                kind="SESSION",
            )
        )
