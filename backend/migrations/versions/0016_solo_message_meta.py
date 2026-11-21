"""Metadata on solo-activity messages.

Self-contained DDL generated from solo_dialogue repositories as of 2026-10-20: a student message
after 不太對 records which part was wrong and any newly chosen option; a tutor message records
its move. Nullable, so existing messages need no backfill.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("solo_messages", sa.Column("meta", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("solo_messages", "meta")
