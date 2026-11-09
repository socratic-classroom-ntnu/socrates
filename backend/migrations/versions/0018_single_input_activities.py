"""Activities keep one input: drop options, multiple questions and the side fields from stored content.

An activity draft is now ``title`` (the teacher's single text), ``starts_at`` and ``ends_at``; a
revision's content is that plus the course snapshot. Upgrade removes ``questions``,
``topic_direction`` and ``analysis_focus`` from every draft and every revision, and recomputes the
revision content hash so it still matches the stored content. No compatibility is kept: the removed
data cannot be rebuilt, so downgrade does nothing. Attempts that pointed at the old questions are
cleared by the solo-activity migration that follows.
"""

import hashlib
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

REMOVED = ("questions", "topic_direction", "analysis_focus")

activities = sa.table("activities", sa.column("id", sa.String), sa.column("draft", sa.JSON))
revisions = sa.table(
    "activity_revisions",
    sa.column("id", sa.String),
    sa.column("content", sa.JSON),
    sa.column("content_hash", sa.String),
)


def _stripped(value: dict) -> dict:
    return {key: item for key, item in value.items() if key not in REMOVED}


def _content_hash(content: dict) -> str:
    raw = json.dumps(content, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(raw.encode()).hexdigest()


def upgrade() -> None:
    bind = op.get_bind()
    for row in bind.execute(sa.select(activities.c.id, activities.c.draft)).all():
        bind.execute(
            sa.update(activities)
            .where(activities.c.id == row.id)
            .values(draft=_stripped(row.draft))
        )
    for row in bind.execute(sa.select(revisions.c.id, revisions.c.content)).all():
        content = _stripped(row.content)
        bind.execute(
            sa.update(revisions)
            .where(revisions.c.id == row.id)
            .values(content=content, content_hash=_content_hash(content))
        )


def downgrade() -> None:
    pass
