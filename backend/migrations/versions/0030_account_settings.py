"""個人設定：帳號的顯示名稱（accounts.display_name_override）與頭像表（account_avatars，圖片存在資料庫，帳號 id 為 key）。

Revision ID: 0030
Revises: 0029
Create Date: 2026-11-23 23:30:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0030"
down_revision: Union[str, None] = "0029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "accounts", sa.Column("display_name_override", sa.String(length=40), nullable=True)
    )
    op.create_table(
        "account_avatars",
        sa.Column("account_id", sa.String(length=36), nullable=False),
        sa.Column("mime", sa.String(length=16), nullable=False),
        sa.Column("image", sa.LargeBinary(), nullable=False),
        sa.Column("updated_at", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("account_id"),
    )


def downgrade() -> None:
    op.drop_table("account_avatars")
    op.drop_column("accounts", "display_name_override")
