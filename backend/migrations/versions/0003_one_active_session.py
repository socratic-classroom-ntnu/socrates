"""Allow at most one active session per learner.

Revision ID: 9a0c1d2e3f40
Revises: 8f1c2d4e6a30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "9a0c1d2e3f40"
down_revision: str | None = "8f1c2d4e6a30"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "uq_sessions_one_active_per_learner",
        "sessions",
        ["learner_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )


def downgrade() -> None:
    op.drop_index("uq_sessions_one_active_per_learner", table_name="sessions")
