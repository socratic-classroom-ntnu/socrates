"""Account role: whether an account registered as a student or a teacher.

Existing accounts become students through the server default; accounts are wiped and recreated
before release, so no role is inferred for them.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0021"
down_revision: Union[str, None] = "0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column("account_role", sa.String(length=16), server_default="student", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("accounts", "account_role")
