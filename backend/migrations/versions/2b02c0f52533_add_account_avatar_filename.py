"""add account avatar filename

Revision ID: 2b02c0f52533
Revises: e00455b3c71f
Create Date: 2026-11-22 15:54:04.260300

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2b02c0f52533'
down_revision: Union[str, None] = 'e00455b3c71f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column("avatar_filename", sa.String(length=100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("accounts", "avatar_filename")
