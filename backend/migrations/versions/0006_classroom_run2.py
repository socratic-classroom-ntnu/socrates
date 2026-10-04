"""Create the frozen Run 2 base schema without importing application models.

This migration must remain deterministic: later application imports must not change
which tables revision 0006 creates. Feature-specific tables belong to later revisions.
"""

from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "9a0c1d2e3f42"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "r2_accounts",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("username", sa.String(64), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("verified", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.Float(), nullable=False),
        sa.UniqueConstraint("email"),
        sa.UniqueConstraint("username"),
    )

    op.create_table(
        "r2_llm_budget",
        sa.Column("id", sa.String(50), primary_key=True, nullable=False),
        sa.Column("calls", sa.Integer(), nullable=False),
    )

    op.create_table(
        "r2_mail_outbox",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("recipient", sa.String(254), nullable=False),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("state", sa.String(20), nullable=False),
        sa.Column("next_at", sa.Float(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
    )

    op.create_table(
        "r2_prompt_programs",
        sa.Column("id", sa.String(100), primary_key=True, nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
    )

    op.create_table(
        "r2_rate_buckets",
        sa.Column("id", sa.String(150), primary_key=True, nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.Float(), nullable=False),
    )
    op.create_index(
        "ix_r2_rate_buckets_expires_at", "r2_rate_buckets", ["expires_at"], unique=False
    )

    op.create_table(
        "r2_email_tokens",
        sa.Column("token_hash", sa.String(64), primary_key=True, nullable=False),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("r2_accounts.id"), nullable=False),
        sa.Column("purpose", sa.String(16), nullable=False),
        sa.Column("expires_at", sa.Float(), nullable=False),
        sa.Column("consumed", sa.Boolean(), nullable=False),
    )
    op.create_index(
        "ix_r2_email_tokens_account_id", "r2_email_tokens", ["account_id"], unique=False
    )

    op.create_table(
        "r2_login_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True, nullable=False),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("r2_accounts.id"), nullable=False),
        sa.Column("csrf_token", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.Float(), nullable=False),
    )
    op.create_index(
        "ix_r2_login_sessions_account_id", "r2_login_sessions", ["account_id"], unique=False
    )
    op.create_index(
        "ix_r2_login_sessions_expires_at", "r2_login_sessions", ["expires_at"], unique=False
    )

    op.create_table(
        "r2_scripts",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("owner_id", sa.String(36), sa.ForeignKey("r2_accounts.id"), nullable=False),
        sa.Column("document", sa.JSON(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
    )
    op.create_index("ix_r2_scripts_owner_id", "r2_scripts", ["owner_id"], unique=False)

    op.create_table(
        "r2_script_snapshots",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("script_id", sa.String(36), sa.ForeignKey("r2_scripts.id"), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("document", sa.JSON(), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
    )
    op.create_index(
        "ix_r2_script_snapshots_script_id", "r2_script_snapshots", ["script_id"], unique=False
    )

    op.create_table(
        "r2_classroom_runs",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("creator_id", sa.String(36), sa.ForeignKey("r2_accounts.id"), nullable=False),
        sa.Column("script_id", sa.String(36), sa.ForeignKey("r2_scripts.id"), nullable=False),
        sa.Column(
            "snapshot_id", sa.String(36), sa.ForeignKey("r2_script_snapshots.id"), nullable=True
        ),
        sa.Column("code", sa.String(12), nullable=False),
        sa.Column("state", sa.JSON(), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("due_at", sa.Float(), nullable=True),
        sa.Column("llm_used", sa.Integer(), nullable=False),
        sa.UniqueConstraint("code"),
    )
    op.create_index(
        "ix_r2_classroom_runs_creator_id", "r2_classroom_runs", ["creator_id"], unique=False
    )
    op.create_index("ix_r2_classroom_runs_due_at", "r2_classroom_runs", ["due_at"], unique=False)

    op.create_table(
        "r2_action_receipts",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("room_id", sa.String(36), sa.ForeignKey("r2_classroom_runs.id"), nullable=False),
        sa.Column("actor_id", sa.String(36), nullable=False),
        sa.Column("action_id", sa.String(100), nullable=False),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("receipt", sa.JSON(), nullable=False),
        sa.UniqueConstraint("room_id", "actor_id", "action_id"),
    )
    op.create_index(
        "ix_r2_action_receipts_room_id", "r2_action_receipts", ["room_id"], unique=False
    )

    op.create_table(
        "r2_classroom_events",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("room_id", sa.String(36), sa.ForeignKey("r2_classroom_runs.id"), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.Float(), nullable=False),
        sa.UniqueConstraint("room_id", "seq"),
    )
    op.create_index(
        "ix_r2_classroom_events_room_id", "r2_classroom_events", ["room_id"], unique=False
    )

    op.create_table(
        "r2_llm_jobs",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("room_id", sa.String(36), sa.ForeignKey("r2_classroom_runs.id"), nullable=False),
        sa.Column("logical_key", sa.String(150), nullable=False),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("context", sa.JSON(), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(20), nullable=False),
        sa.Column("next_at", sa.Float(), nullable=False),
        sa.Column("lease", sa.String(36), nullable=True),
        sa.Column("lease_until", sa.Float(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("audit", sa.JSON(), nullable=True),
        sa.UniqueConstraint("room_id", "logical_key"),
    )
    op.create_index("ix_r2_llm_jobs_next_at", "r2_llm_jobs", ["next_at"], unique=False)
    op.create_index("ix_r2_llm_jobs_room_id", "r2_llm_jobs", ["room_id"], unique=False)
    op.create_index("ix_r2_llm_jobs_state", "r2_llm_jobs", ["state"], unique=False)

    op.create_table(
        "r2_memberships",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("room_id", sa.String(36), sa.ForeignKey("r2_classroom_runs.id"), nullable=False),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("r2_accounts.id"), nullable=False),
        sa.Column("role", sa.String(12), nullable=False),
        sa.Column("alias", sa.String(40), nullable=False),
        sa.Column("avatar", sa.String(64), nullable=False),
        sa.Column("seat", sa.Integer(), nullable=True),
        sa.Column("last_seen", sa.Float(), nullable=False),
        sa.UniqueConstraint("room_id", "account_id", "role"),
        sa.UniqueConstraint("room_id", "seat"),
    )
    op.create_index("ix_r2_memberships_account_id", "r2_memberships", ["account_id"], unique=False)
    op.create_index("ix_r2_memberships_room_id", "r2_memberships", ["room_id"], unique=False)

    op.create_table(
        "r2_question_runs",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("room_id", sa.String(36), sa.ForeignKey("r2_classroom_runs.id"), nullable=False),
        sa.Column("question_index", sa.Integer(), nullable=False),
        sa.Column("definition", sa.JSON(), nullable=False),
        sa.Column("state", sa.JSON(), nullable=False),
    )
    op.create_index("ix_r2_question_runs_room_id", "r2_question_runs", ["room_id"], unique=False)

    op.create_table(
        "r2_llm_call_audit",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("job_id", sa.String(36), sa.ForeignKey("r2_llm_jobs.id"), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.Float(), nullable=False),
    )
    op.create_index("ix_r2_llm_call_audit_job_id", "r2_llm_call_audit", ["job_id"], unique=False)

    op.create_table(
        "r2_point_ledger",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("room_id", sa.String(36), sa.ForeignKey("r2_classroom_runs.id"), nullable=False),
        sa.Column("action_id", sa.String(100), nullable=False),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("r2_accounts.id"), nullable=False),
        sa.Column("member_id", sa.String(36), sa.ForeignKey("r2_memberships.id"), nullable=False),
        sa.Column("focus_id", sa.String(36), nullable=False),
        sa.Column("turn_index", sa.Integer(), nullable=False),
        sa.Column("side", sa.String(12), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.UniqueConstraint("room_id", "action_id", "account_id", "side"),
    )
    op.create_index(
        "ix_r2_point_ledger_account_id", "r2_point_ledger", ["account_id"], unique=False
    )
    op.create_index("ix_r2_point_ledger_room_id", "r2_point_ledger", ["room_id"], unique=False)

    op.create_table(
        "r2_question_answers",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("room_id", sa.String(36), sa.ForeignKey("r2_classroom_runs.id"), nullable=False),
        sa.Column(
            "question_run_id", sa.String(36), sa.ForeignKey("r2_question_runs.id"), nullable=False
        ),
        sa.Column(
            "membership_id", sa.String(36), sa.ForeignKey("r2_memberships.id"), nullable=False
        ),
        sa.Column("body", sa.JSON(), nullable=False),
        sa.UniqueConstraint("question_run_id", "membership_id"),
    )
    op.create_index(
        "ix_r2_question_answers_room_id", "r2_question_answers", ["room_id"], unique=False
    )


def downgrade() -> None:
    raise RuntimeError("Run 2 data is retained. Use a reviewed data migration for schema rollback.")
