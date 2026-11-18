"""0027 splits the activity's single text into a name and a scenario.

Before 0027 one text was both the activity's name and the material its first scenario is written
from. Upgrade keeps that text whole as ``scenario`` and cuts the name to the 40-character limit,
in every draft, every revision (hash recomputed) and the live name column. The test starts a
fresh database at 0026, adds a published activity the way it looks today, then upgrades.
"""

import hashlib
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
OLD_TEXT = "岔道上的選擇：一輛失控的電車正駛向五名工人，你站在拉桿旁，拉下它電車會轉向另一條軌道，那裡有一名工人。"


@pytest.fixture
def fresh_database_url():
    parts = urlsplit(os.environ["DATABASE_URL"])
    name = f"{parts.path.lstrip('/')}_scenario_split_{uuid.uuid4().hex[:8]}"
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


def _hash(content: dict) -> str:
    raw = json.dumps(content, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(raw.encode()).hexdigest()


def test_the_old_text_becomes_the_scenario_and_the_name_is_cut_to_40(fresh_database_url):
    assert len(OLD_TEXT) > 40
    _upgrade(fresh_database_url, "0026")
    engine = create_engine(fresh_database_url)
    draft = {"title": OLD_TEXT, "starts_at": None, "ends_at": 2000.0}
    content = {**draft, "starts_at": 1000.0, "course_intro": "", "course_goals": ""}
    short_draft = {"title": "電車難題", "starts_at": None, "ends_at": 2000.0}
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "insert into accounts (id, username, verified, created_at)"
                    " values ('t1', 't1', true, 0)"
                )
            )
            conn.execute(
                text(
                    "insert into courses (id, owner_id, name, teacher_name, intro, goals, code,"
                    " code_enabled, created_at, updated_at)"
                    " values ('c1', 't1', '課', '老師', '', '', 'ABCD1234', true, 0, 0)"
                )
            )
            for activity_id, row_draft in (("a1", draft), ("a2", short_draft)):
                conn.execute(
                    text(
                        "insert into activities (id, course_id, title, draft, deleted,"
                        " created_at, updated_at) values (:id, 'c1', :title, :draft, false, 0, 0)"
                    ),
                    {
                        "id": activity_id,
                        "title": row_draft["title"],
                        "draft": json.dumps(row_draft),
                    },
                )
            conn.execute(
                text(
                    "insert into activity_revisions (id, activity_id, number, content,"
                    " content_hash, created_at) values ('r1', 'a1', 1, :content, :hash, 0)"
                ),
                {"content": json.dumps(content), "hash": _hash(content)},
            )

        _upgrade(fresh_database_url, "0027")

        with engine.connect() as conn:
            rows = {
                row.id: (
                    row.title,
                    json.loads(row.draft) if isinstance(row.draft, str) else row.draft,
                )
                for row in conn.execute(text("select id, title, draft from activities"))
            }
            revision = conn.execute(
                text("select content, content_hash from activity_revisions")
            ).one()
    finally:
        engine.dispose()

    name = OLD_TEXT[:40]
    assert rows["a1"] == (name, {**draft, "title": name, "scenario": OLD_TEXT})
    assert rows["a2"] == ("電車難題", {**short_draft, "scenario": "電車難題"})
    served = (
        revision.content if isinstance(revision.content, dict) else json.loads(revision.content)
    )
    assert served == {**content, "title": name, "scenario": OLD_TEXT}
    assert revision.content_hash == _hash(served)
