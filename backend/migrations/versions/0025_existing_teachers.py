"""Existing teachers get the teacher role back.

0023 made every existing account a student. Accounts that own a course or a group-classroom
script, or started a group classroom, were teaching before roles existed, so upgrade marks them
teachers; everyone else stays a student. No schema changes. Downgrade does nothing: turning
teachers back into students would only lock them out of their own courses again.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0025"
down_revision: Union[str, None] = "0024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE accounts SET account_role = 'teacher'
        WHERE id IN (SELECT owner_id FROM courses)
           OR id IN (SELECT owner_id FROM scripts)
           OR id IN (SELECT creator_id FROM classroom_runs)
        """
    )


def downgrade() -> None:
    pass
