"""Guest accounts: a kind column, an expiry for guests, and no email or password for them.

Existing accounts become "registered" through the server default. A unique column already allows
many nulls, so the email constraint keeps applying to every account that has an email.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0020"
down_revision: Union[str, None] = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column("kind", sa.String(length=16), server_default="registered", nullable=False),
    )
    op.add_column("accounts", sa.Column("guest_expires_at", sa.Float(), nullable=True))
    op.create_index(
        op.f("ix_accounts_guest_expires_at"), "accounts", ["guest_expires_at"], unique=False
    )
    op.alter_column("accounts", "email", existing_type=sa.String(length=254), nullable=True)
    op.alter_column("accounts", "password_hash", existing_type=sa.Text(), nullable=True)


def downgrade() -> None:
    # Guests cannot satisfy the restored NOT NULL columns, so they go first. Records other
    # modules keep for a guest block this; the expiry job's delete hooks remove them.
    guests = "SELECT id FROM accounts WHERE kind = 'guest'"
    op.execute(f"DELETE FROM login_sessions WHERE account_id IN ({guests})")
    op.execute("DELETE FROM accounts WHERE kind = 'guest'")
    op.alter_column("accounts", "password_hash", existing_type=sa.Text(), nullable=False)
    op.alter_column("accounts", "email", existing_type=sa.String(length=254), nullable=False)
    op.drop_index(op.f("ix_accounts_guest_expires_at"), table_name="accounts")
    op.drop_column("accounts", "guest_expires_at")
    op.drop_column("accounts", "kind")
