"""Add durable R88 LLM Student profiles without importing future ORM metadata."""

from alembic import op
import sqlalchemy as sa

revision = "0088"
down_revision = ("0007", "0073_portal")
branch_labels = None
depends_on = None


def upgrade():
    if sa.inspect(op.get_bind()).has_table("r88_ai_students"):
        return
    op.create_table(
        "r88_ai_students",
        sa.Column(
            "account_id",
            sa.String(36),
            sa.ForeignKey("r2_accounts.id"),
            primary_key=True,
        ),
        sa.Column(
            "parent_room_id",
            sa.String(36),
            sa.ForeignKey("r2_classroom_runs.id"),
            nullable=False,
        ),
        sa.Column("persona", sa.JSON(), nullable=False),
        sa.Column(
            "model",
            sa.String(160),
            nullable=False,
            server_default="openrouter/free",
        ),
        sa.Column("seed", sa.Integer(), nullable=False),
        sa.Column(
            "enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "created_at",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.create_index(
        "ix_r88_ai_students_parent_room_id",
        "r88_ai_students",
        ["parent_room_id"],
    )


def downgrade():
    op.drop_index(
        "ix_r88_ai_students_parent_room_id",
        table_name="r88_ai_students",
    )
    op.drop_table("r88_ai_students")
