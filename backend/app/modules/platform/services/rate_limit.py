"""Shared database-backed request rate limiting."""

import time

from app.modules.platform.errors import DomainError
from app.modules.platform.repositories.classroom_storage import RateBucket


def limit(
    db,
    key: str,
    maximum: int,
    seconds: int,
    *,
    error_code: str = "稍候即可再次送出。",
) -> None:
    now = time.time()
    bucket_key = f"{key}:{int(now) // seconds}"
    # Room operations hold their aggregate lock; auth buckets use atomic upsert.
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert

    ins = pg_insert if db.bind.dialect.name == "postgresql" else sqlite_insert
    stmt = ins(RateBucket).values(id=bucket_key, count=1, expires_at=now + seconds)
    value = db.scalar(
        stmt.on_conflict_do_update(
            index_elements=[RateBucket.id], set_={"count": RateBucket.count + 1}
        ).returning(RateBucket.count)
    )
    if value > maximum:
        raise DomainError(error_code, 429)
