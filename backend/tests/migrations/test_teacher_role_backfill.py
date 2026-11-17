"""0025 gives existing teachers their role back: 0023 made every existing account a student.

An account counts as a teacher when it owns a course or a group-classroom script, or started a
group classroom. Everyone else stays a student. The test starts a fresh database at 0024, adds
those accounts the way they look on stage, then upgrades to 0025.
"""

import json
import os
import subprocess
import sys
import uuid
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import pytest
from sqlalchemy import create_engine, text

BACKEND = Path(__file__).resolve().parents[2]


@pytest.fixture
def fresh_database_url():
    parts = urlsplit(os.environ["DATABASE_URL"])
    name = f"{parts.path.lstrip('/')}_role_backfill_{uuid.uuid4().hex[:8]}"
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


def _upgrade(url: str, revision: str) -> None:
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", revision],
        cwd=BACKEND,
        env={**os.environ, "DATABASE_URL": url},
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr


def test_course_script_and_classroom_owners_become_teachers(fresh_database_url):
    _upgrade(fresh_database_url, "0024")
    engine = create_engine(fresh_database_url)
    try:
        with engine.begin() as conn:
            for name in ("course_owner", "script_owner", "run_creator", "plain_student"):
                conn.execute(
                    text(
                        "insert into accounts (id, username, verified, created_at)"
                        " values (:name, :name, true, 0)"
                    ),
                    {"name": name},
                )
            conn.execute(
                text(
                    "insert into courses (id, owner_id, name, teacher_name, intro, goals, code,"
                    " code_enabled, created_at, updated_at)"
                    " values ('c1', 'course_owner', '課', '老師', '', '', 'ABCD1234', true, 0, 0)"
                )
            )
            conn.execute(
                text(
                    "insert into scripts (id, owner_id, document, revision)"
                    " values ('s1', 'script_owner', '{}', 1)"
                )
            )
            # 用別人的劇本開教室：開的人也是老師
            conn.execute(
                text(
                    "insert into classroom_runs (id, creator_id, script_id, code, state, seq, llm_used)"
                    " values ('r1', 'run_creator', 's1', 'ROOM1', :state, 0, 0)"
                ),
                {"state": json.dumps({})},
            )

        _upgrade(fresh_database_url, "0025")

        with engine.connect() as conn:
            roles = dict(conn.execute(text("select username, account_role from accounts")).all())
    finally:
        engine.dispose()

    assert roles == {
        "course_owner": "teacher",
        "script_owner": "teacher",
        "run_creator": "teacher",
        "plain_student": "student",
    }
