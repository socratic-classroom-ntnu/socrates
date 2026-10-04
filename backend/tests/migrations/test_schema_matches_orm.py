"""A fresh database built by the migrations must match what the ORM declares.

The ORM is the single source of the schema; every migration is generated from it. If the
two disagree, either a model changed without a migration or a migration was hand-written
differently — 0104 was, and nothing noticed until 2026-10-05.

"Match" means as far as alembic's compare_metadata can see: tables, columns, types, server
defaults, indexes, unique and foreign keys. It does not compare check constraints, triggers or
sequences; the ORM declares none of those today.
"""

import os
import subprocess
import sys
import uuid
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, text

from app import interaction_models, models  # noqa: F401
from app.db import Base as RoundOneBase
from app.run2 import storage

BACKEND = Path(__file__).resolve().parents[2]


@pytest.fixture
def fresh_database_url():
    parts = urlsplit(os.environ["DATABASE_URL"])
    name = f"{parts.path.lstrip('/')}_migrations_{uuid.uuid4().hex[:8]}"
    admin = create_engine(
        urlunsplit(parts._replace(path="/postgres")), isolation_level="AUTOCOMMIT"
    )
    with admin.connect() as conn:
        conn.execute(text(f'create database "{name}"'))
    try:
        yield urlunsplit(parts._replace(path=f"/{name}"))
    finally:
        with admin.connect() as conn:
            conn.execute(text(f'drop database if exists "{name}" with (force)'))
        admin.dispose()


def test_a_fresh_database_matches_the_orm(fresh_database_url):
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND,
        env={**os.environ, "DATABASE_URL": fresh_database_url},
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr

    storage.register_models()
    engine = create_engine(fresh_database_url)
    try:
        with engine.connect() as conn:
            context = MigrationContext.configure(
                conn, opts={"compare_type": True, "compare_server_default": True}
            )
            diff = compare_metadata(context, [RoundOneBase.metadata, storage.Base.metadata])
    finally:
        engine.dispose()
    assert diff == []
