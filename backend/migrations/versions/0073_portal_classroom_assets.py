"""Create durable Classroom assets, linked sessions, and mutation receipts.

The migration is intentionally self-contained. Application ORM imports are forbidden
because later model edits must not change the schema produced by this revision.
"""

from alembic import op
import sqlalchemy as sa

revision = "0073_portal"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    if not inspector.has_table("r73_classroom_assets"):
        op.create_table(
            "r73_classroom_assets",
            sa.Column("id", sa.String(36), primary_key=True, nullable=False),
            sa.Column(
                "owner_id",
                sa.String(36),
                sa.ForeignKey("r2_accounts.id"),
                nullable=False,
            ),
            sa.Column("title", sa.String(160), nullable=False),
            sa.Column("revision", sa.Integer(), nullable=False),
            sa.Column("assets", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.Float(), nullable=False),
        )
        op.create_index(
            "ix_r73_classroom_assets_owner_id",
            "r73_classroom_assets",
            ["owner_id"],
        )

    if not inspector.has_table("r73_classroom_sessions"):
        op.create_table(
            "r73_classroom_sessions",
            sa.Column(
                "room_id",
                sa.String(36),
                sa.ForeignKey("r2_classroom_runs.id"),
                primary_key=True,
                nullable=False,
            ),
            sa.Column(
                "classroom_id",
                sa.String(36),
                sa.ForeignKey("r73_classroom_assets.id"),
                nullable=False,
            ),
            sa.Column("batch_id", sa.String(36), nullable=False),
            sa.Column("kind", sa.String(20), nullable=False),
            sa.Column("created_at", sa.Float(), nullable=False),
        )
        op.create_index(
            "ix_r73_classroom_sessions_classroom_id",
            "r73_classroom_sessions",
            ["classroom_id"],
        )
        op.create_index(
            "ix_r73_classroom_sessions_batch_id",
            "r73_classroom_sessions",
            ["batch_id"],
        )

    if not inspector.has_table("r73_library_receipts"):
        op.create_table(
            "r73_library_receipts",
            sa.Column("key", sa.String(200), primary_key=True, nullable=False),
            sa.Column("payload_hash", sa.String(64), nullable=False),
            sa.Column("response", sa.JSON(), nullable=False),
        )


def downgrade() -> None:
    raise RuntimeError("CLASSROOM_DATA_RESTORE_RECEIPT_REQUIRED")
