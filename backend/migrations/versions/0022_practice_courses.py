"""Practice courses for 我的對話: which student a private course belongs to, and which bank topic an
activity came from.

Both columns are nullable: every existing course is an ordinary course and every existing activity
was written by a teacher. The unique constraint keeps one private course per student even when two
first requests race.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0022"
down_revision: Union[str, None] = "0021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("activities", sa.Column("bank_item_id", sa.String(length=40), nullable=True))
    op.add_column("courses", sa.Column("practice_account_id", sa.String(length=36), nullable=True))
    op.create_unique_constraint(
        "uq_courses_practice_account_id", "courses", ["practice_account_id"]
    )
    op.create_foreign_key(
        "fk_courses_practice_account_id", "courses", "accounts", ["practice_account_id"], ["id"]
    )


def downgrade() -> None:
    op.drop_constraint("fk_courses_practice_account_id", "courses", type_="foreignkey")
    op.drop_constraint("uq_courses_practice_account_id", "courses", type_="unique")
    op.drop_column("courses", "practice_account_id")
    op.drop_column("activities", "bank_item_id")
