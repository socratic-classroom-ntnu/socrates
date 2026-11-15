"""Solo attempts keep their final summary (O6): the one shown, then the one confirmed or kept.

One nullable JSON column. Existing attempts get none; an attempt already in the review is offered
writing the summary when the student comes back.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0021"
down_revision: Union[str, None] = "0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("solo_attempts", sa.Column("final", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("solo_attempts", "final")
