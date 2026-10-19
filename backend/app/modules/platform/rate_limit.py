"""Infrastructure-level fixed-window rate limiting."""

import time

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.modules.platform.errors import DomainError
from app.modules.platform.repositories import RateBucket


def enforce_rate_limit(db: Session, key: str, maximum: int, seconds: int) -> None:
    now = time.time()
    bucket_key = f"{key}:{int(now) // seconds}"
    ins = (
        pg_insert if db.bind is not None and db.bind.dialect.name == "postgresql" else sqlite_insert
    )
    stmt = ins(RateBucket).values(id=bucket_key, count=1, expires_at=now + seconds)
    value = db.scalar(
        stmt.on_conflict_do_update(
            index_elements=[RateBucket.id], set_={"count": RateBucket.count + 1}
        ).returning(RateBucket.count)
    )
    if value is not None and value > maximum:
        raise DomainError("稍候即可再次送出。", 429)
