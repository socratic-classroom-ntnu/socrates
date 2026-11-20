"""Allow direct interactive LLM calls to share the durable audit table.

Self-contained DDL matching app.modules.platform.storage.CallAudit as of 2026-10-13.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "llm_call_audit",
        "job_id",
        existing_type=sa.String(length=36),
        nullable=True,
    )


def downgrade() -> None:
    op.execute("DELETE FROM llm_call_audit WHERE job_id IS NULL")
    op.alter_column(
        "llm_call_audit",
        "job_id",
        existing_type=sa.String(length=36),
        nullable=False,
    )
