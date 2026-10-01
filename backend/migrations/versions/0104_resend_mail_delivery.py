"""Add durable transactional-mail delivery receipts."""

from alembic import op
import sqlalchemy as sa

revision = "0104"
down_revision = "0097"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "r104_mail_delivery",
        sa.Column(
            "mail_id",
            sa.String(36),
            sa.ForeignKey("r2_mail_outbox.id"),
            primary_key=True,
        ),
        sa.Column(
            "account_id",
            sa.String(36),
            sa.ForeignKey("r2_accounts.id"),
            nullable=True,
        ),
        sa.Column(
            "purpose",
            sa.String(24),
            nullable=False,
            server_default="transactional",
        ),
        sa.Column("html_body", sa.Text(), nullable=True),
        sa.Column("preview_url", sa.Text(), nullable=True),
        sa.Column(
            "idempotency_key",
            sa.String(64),
            nullable=False,
            unique=True,
        ),
        sa.Column("provider", sa.String(32), nullable=True),
        sa.Column(
            "provider_message_id",
            sa.String(160),
            nullable=True,
        ),
        sa.Column(
            "provider_status",
            sa.String(40),
            nullable=False,
            server_default="QUEUED",
        ),
        sa.Column("lease", sa.String(36), nullable=True),
        sa.Column(
            "lease_until",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column(
            "events",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
        sa.Column(
            "created_at",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "updated_at",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("sent_at", sa.Float(), nullable=True),
        sa.Column("delivered_at", sa.Float(), nullable=True),
    )
    op.create_index(
        "ix_r104_mail_delivery_account",
        "r104_mail_delivery",
        ["account_id"],
    )
    op.create_index(
        "ix_r104_mail_delivery_purpose",
        "r104_mail_delivery",
        ["purpose"],
    )
    op.create_index(
        "ix_r104_mail_delivery_idempotency",
        "r104_mail_delivery",
        ["idempotency_key"],
        unique=True,
    )
    op.create_index(
        "ix_r104_mail_delivery_provider_message",
        "r104_mail_delivery",
        ["provider_message_id"],
    )
    op.create_index(
        "ix_r104_mail_delivery_created",
        "r104_mail_delivery",
        ["created_at"],
    )


def downgrade():
    op.drop_index(
        "ix_r104_mail_delivery_created",
        table_name="r104_mail_delivery",
    )
    op.drop_index(
        "ix_r104_mail_delivery_provider_message",
        table_name="r104_mail_delivery",
    )
    op.drop_index(
        "ix_r104_mail_delivery_idempotency",
        table_name="r104_mail_delivery",
    )
    op.drop_index(
        "ix_r104_mail_delivery_purpose",
        table_name="r104_mail_delivery",
    )
    op.drop_index(
        "ix_r104_mail_delivery_account",
        table_name="r104_mail_delivery",
    )
    op.drop_table("r104_mail_delivery")
