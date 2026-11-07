"""題庫商店（issue #17）：老師發布到共享題庫的單一題目。

Self-contained DDL matching app.modules.platform.storage.BankQuestion as of 2026-10-12.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bank_questions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("owner_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("question", sa.JSON(), nullable=False),
        sa.Column("tags", sa.JSON(), nullable=False),
        sa.Column("search_text", sa.Text(), nullable=False),
        sa.Column("source_script_id", sa.String(length=36), nullable=True),
        sa.Column("source_question_id", sa.String(length=64), nullable=True),
        sa.Column("published_at", sa.Float(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["accounts.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_bank_questions_owner_id"), "bank_questions", ["owner_id"], unique=False
    )
    op.create_index(
        op.f("ix_bank_questions_published_at"), "bank_questions", ["published_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_bank_questions_published_at"), table_name="bank_questions")
    op.drop_index(op.f("ix_bank_questions_owner_id"), table_name="bank_questions")
    op.drop_table("bank_questions")
