"""語音模式：每位學生每天（台北時間）用了幾秒語音（solo_voice_usage）。

新表，不動既有資料；不存任何錄音。
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0032"
down_revision: Union[str, None] = "0031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "solo_voice_usage",
        sa.Column("account_id", sa.String(length=36), nullable=False),
        sa.Column("day", sa.String(length=10), nullable=False),
        sa.Column("seconds", sa.Float(), nullable=False),
        sa.Column("updated_at", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"]),
        sa.PrimaryKeyConstraint("account_id", "day"),
    )


def downgrade() -> None:
    op.drop_table("solo_voice_usage")
