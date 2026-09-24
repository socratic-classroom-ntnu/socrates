"""Widen the Run2 membership alias so it can hold any registered username.

Revision ID: 0007
Revises: 0006

A teacher's classroom alias is derived from the account username, which the
registration contract allows up to 64 characters, while the column was 40.
Creating a classroom as such a teacher raised DataError on PostgreSQL.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "r2_memberships",
        "alias",
        existing_type=sa.String(length=40),
        type_=sa.String(length=64),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "r2_memberships",
        "alias",
        existing_type=sa.String(length=64),
        type_=sa.String(length=40),
        existing_nullable=False,
    )
