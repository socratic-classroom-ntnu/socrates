"""Account profile pictures, kept in the database next to the account.

The browser crops and shrinks the picture before sending it, so the server only checks the file
header and the size; it never decodes the image.
"""

import base64
import binascii
import time

from sqlalchemy.orm import Session

from app.modules.identity_access.repositories import AccountAvatar
from app.modules.platform.errors import DomainError

MAX_BYTES = 200 * 1024
# base64 grows the data by a third; anything longer cannot decode to MAX_BYTES or less.
MAX_BASE64 = (MAX_BYTES + 2) // 3 * 4
# The same header check as feedback screenshots (feedback/service.py MAGIC), kept here so
# identity_access does not depend on the feedback module.
MAGIC: dict[str, bytes] = {
    "image/png": b"\x89PNG\r\n\x1a\n",
    "image/jpeg": b"\xff\xd8\xff",
}


def decode(mime: str, data_base64: str) -> bytes:
    if mime not in MAGIC or len(data_base64) > MAX_BASE64:
        raise DomainError("AVATAR_INVALID", 422)
    try:
        data = base64.b64decode(data_base64, validate=True)
    except (binascii.Error, ValueError):
        raise DomainError("AVATAR_INVALID", 422) from None
    if not data or len(data) > MAX_BYTES or not data.startswith(MAGIC[mime]):
        raise DomainError("AVATAR_INVALID", 422)
    return data


def save(db: Session, account_id: str, mime: str, data: bytes) -> None:
    row = db.get(AccountAvatar, account_id, with_for_update=True)
    # Strictly later than the last version, so the browser reads the new picture.
    now = max(time.time(), row.updated_at + 0.001) if row is not None else time.time()
    if row is None:
        db.add(AccountAvatar(account_id=account_id, mime=mime, image=data, updated_at=now))
    else:
        row.mime, row.image, row.updated_at = mime, data, now
    db.flush()


def remove(db: Session, account_id: str) -> None:
    row = db.get(AccountAvatar, account_id)
    if row is not None:
        db.delete(row)
        db.flush()


def read(db: Session, account_id: str) -> tuple[str, bytes]:
    row = db.get(AccountAvatar, account_id)
    if row is None:
        raise DomainError("AVATAR_NOT_FOUND", 404)
    return row.mime, row.image


def version(db: Session, account_id: str) -> float | None:
    row = db.get(AccountAvatar, account_id)
    return row.updated_at if row is not None else None
