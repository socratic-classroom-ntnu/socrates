"""Activities get a name and a scenario: the single text becomes the scenario.

Until now one text was both the activity's name and the material its first scenario is written
from. Upgrade copies that text whole into ``scenario`` and cuts ``title`` to the new 40-character
name limit, in every draft, every revision (content hash recomputed so it still matches) and the
``activities.title`` column. No schema changes. Downgrade does nothing: the cut names cannot be
restored.
"""

import hashlib
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0027"
down_revision: Union[str, None] = "0026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NAME_LIMIT = 40

activities = sa.table(
    "activities",
    sa.column("id", sa.String),
    sa.column("title", sa.String),
    sa.column("draft", sa.JSON),
)
revisions = sa.table(
    "activity_revisions",
    sa.column("id", sa.String),
    sa.column("content", sa.JSON),
    sa.column("content_hash", sa.String),
)


def _split(value: dict) -> dict:
    if "scenario" in value:
        return value
    text = value["title"]
    return {**value, "title": text[:NAME_LIMIT], "scenario": text}


def _content_hash(content: dict) -> str:
    raw = json.dumps(content, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(raw.encode()).hexdigest()


def upgrade() -> None:
    bind = op.get_bind()
    for row in bind.execute(
        sa.select(activities.c.id, activities.c.title, activities.c.draft)
    ).all():
        bind.execute(
            sa.update(activities)
            .where(activities.c.id == row.id)
            .values(title=row.title[:NAME_LIMIT], draft=_split(row.draft))
        )
    for row in bind.execute(sa.select(revisions.c.id, revisions.c.content)).all():
        content = _split(row.content)
        bind.execute(
            sa.update(revisions)
            .where(revisions.c.id == row.id)
            .values(content=content, content_hash=_content_hash(content))
        )


def downgrade() -> None:
    pass
