"""Move the tables of the legacy solo dialogue into their own schema.

The legacy solo dialogue (its module, routes and screens) was removed and nothing reads or writes
these tables any more. Their rows are kept: upgrade moves the seven tables, with their indexes and
foreign keys, from the default schema into ``legacy_solo_dialogue``, out of the application's way.
A later migration can carry the rows over to the solo-activity tables and then drop the schema
(issue #71). Downgrade moves them back unchanged.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ARCHIVE = "legacy_solo_dialogue"
TABLES = (
    "learners",
    "sessions",
    "stage_progress",
    "messages",
    "summaries",
    "transcript_drafts",
    "interaction_events",
)


def upgrade() -> None:
    op.execute(f"CREATE SCHEMA {ARCHIVE}")
    for table in TABLES:
        op.execute(f"ALTER TABLE public.{table} SET SCHEMA {ARCHIVE}")


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE {ARCHIVE}.{table} SET SCHEMA public")
    op.execute(f"DROP SCHEMA {ARCHIVE}")
