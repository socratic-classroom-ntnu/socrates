"""Soft-delete flag for activities.

Self-contained DDL matching course_management repositories as of 2026-10-19: deleting an
activity only sets this flag, so its revisions (and, from M3, its attempts) stay in place.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "activities",
        sa.Column("deleted", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("activities", "deleted")
