"""The teacher's radar for a solo activity, kept as last computed (one row per activity).

A new table only: nothing existing changes, and downgrade drops it.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0026"
down_revision: Union[str, None] = "0025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "solo_radars",
        sa.Column("activity_id", sa.String(36), sa.ForeignKey("activities.id"), primary_key=True),
        sa.Column("basis", sa.String(64), nullable=False),
        sa.Column("dimensions", sa.JSON(), nullable=False),
        sa.Column("students", sa.JSON(), nullable=False),
        sa.Column("computed_at", sa.Float(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("solo_radars")
