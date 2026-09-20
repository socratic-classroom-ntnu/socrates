"""Persist HTTP retry attempts for each pending student message.

Revision ID: 9a0c1d2e3f41
Revises: 9a0c1d2e3f40
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "9a0c1d2e3f41"
down_revision: str | None = "9a0c1d2e3f40"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "messages",
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("messages", "retry_count")
