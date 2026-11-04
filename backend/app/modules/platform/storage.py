"""PostgreSQL durable state and exact transaction boundary.

Room row locks serialize a room's commands; separate rooms progress concurrently.
An event identifier is notified in the same transaction as its persistent event.
SQLite is solely a unit-test adapter; production uses PostgreSQL.
"""

from typing import Any
import hashlib
import json
import os
from contextlib import contextmanager
from app.modules.platform.env import env_str
from sqlalchemy import (
    create_engine,
    text,
)
from sqlalchemy.orm import DeclarativeBase, sessionmaker


class Base(DeclarativeBase):
    pass


_ENGINE: Any = None
_FACTORY: Any = None


def configure(url: str | None = None, *, create: bool = False):
    global _ENGINE, _FACTORY
    from_environment = env_str(
        "CLASSROOM_DATABASE_URL",
        os.environ.get("DATABASE_URL", "postgresql+psycopg://socrates@localhost/socrates"),
    )
    resolved = url if url else from_environment
    kw: dict[str, Any] = {"pool_pre_ping": True}
    if resolved.startswith("sqlite"):
        from sqlalchemy.pool import StaticPool

        kw.update(connect_args={"check_same_thread": False}, poolclass=StaticPool)
    else:
        kw.update(pool_size=5, max_overflow=5, pool_timeout=10)
    _ENGINE = create_engine(resolved, **kw)
    _FACTORY = sessionmaker(_ENGINE, expire_on_commit=False)
    if create:
        Base.metadata.create_all(_ENGINE)
    return _ENGINE


def engine():
    if _ENGINE is None:
        configure()
    return _ENGINE


@contextmanager
def transaction():
    engine()
    with _FACTORY.begin() as s:
        yield s


def digest(value) -> str:
    raw = (
        value
        if isinstance(value, str)
        else json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    )
    return hashlib.sha256(raw.encode()).hexdigest()


def notify(db, payload: dict, channel="socrates_classroom"):
    if db.bind.dialect.name == "postgresql":
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        if len(body.encode()) > 7400:
            raise ValueError("notification envelope budget")
        db.execute(
            text("SELECT pg_notify(:channel,:payload)"), {"channel": channel, "payload": body}
        )


def deepcopy_json(value):
    return json.loads(json.dumps(value))
