"""Idempotency receipts shared by content-authoring mutations."""

from app.modules.platform.repositories.classroom_storage import digest


def mutate(db, account, operation, body, action):
    # Imported lazily because the ORM model still lives in the legacy route module.
    from app.modules.content_authoring.api.routes.classroom_library import (
        DomainError,
        LibraryReceipt,
    )

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
