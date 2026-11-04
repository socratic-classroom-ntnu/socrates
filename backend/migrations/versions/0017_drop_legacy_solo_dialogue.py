"""Drop the tables of the legacy solo dialogue.

The legacy solo dialogue (its module, routes and screens) was removed; nothing reads or writes these
tables any more. Upgrade drops them, dependents first. Downgrade recreates the empty tables with the
schema they had at 0016; the rows are not restored, so export them before upgrading a database whose
legacy sessions you still need (issue #71).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("ix_messages_session_id", table_name="messages")
    op.drop_table("messages")
    op.drop_table("summaries")
    op.drop_index("ix_interaction_events_event_type", table_name="interaction_events")
    op.drop_index("ix_interaction_events_learner_id", table_name="interaction_events")
    op.drop_index("ix_interaction_events_session_id", table_name="interaction_events")
    op.drop_table("interaction_events")
    op.drop_index("ix_transcript_drafts_learner_id", table_name="transcript_drafts")
    op.drop_index("ix_transcript_drafts_session_id", table_name="transcript_drafts")
    op.drop_table("transcript_drafts")
    op.drop_index("ix_stage_progress_session_id", table_name="stage_progress")
    op.drop_table("stage_progress")
    op.drop_index("ix_sessions_learner_id", table_name="sessions")
    op.drop_index(
        "uq_sessions_one_active_per_learner",
        table_name="sessions",
        postgresql_where="((status)::text = 'active'::text)",
    )
    op.drop_table("sessions")
    op.drop_table("learners")


def downgrade() -> None:
    op.create_table(
        "learners",
        sa.Column("id", sa.UUID(), autoincrement=False, nullable=False),
        sa.Column(
            "created_at", postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name="learners_pkey"),
        postgresql_ignore_search_path=False,
    )
    op.create_table(
        "sessions",
        sa.Column("id", sa.UUID(), autoincrement=False, nullable=False),
        sa.Column("learner_id", sa.UUID(), autoincrement=False, nullable=False),
        sa.Column("ladder_id", sa.VARCHAR(length=64), autoincrement=False, nullable=False),
        sa.Column("ladder_version", sa.INTEGER(), autoincrement=False, nullable=False),
        sa.Column("status", sa.VARCHAR(length=16), autoincrement=False, nullable=False),
        sa.Column("flow_state", sa.VARCHAR(length=32), autoincrement=False, nullable=False),
        sa.Column("current_stage_index", sa.INTEGER(), autoincrement=False, nullable=False),
        sa.Column("extra_turns_used", sa.INTEGER(), autoincrement=False, nullable=False),
        sa.Column("parent_session_id", sa.UUID(), autoincrement=False, nullable=True),
        sa.Column(
            "started_at", postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=False
        ),
        sa.Column(
            "ended_at", postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True
        ),
        sa.Column("end_reason", sa.VARCHAR(length=32), autoincrement=False, nullable=True),
        sa.ForeignKeyConstraint(["learner_id"], ["learners.id"], name="sessions_learner_id_fkey"),
        sa.ForeignKeyConstraint(
            ["parent_session_id"], ["sessions.id"], name="sessions_parent_session_id_fkey"
        ),
        sa.PrimaryKeyConstraint("id", name="sessions_pkey"),
        postgresql_ignore_search_path=False,
    )
    op.create_index(
        "uq_sessions_one_active_per_learner",
        "sessions",
        ["learner_id"],
        unique=True,
        postgresql_where="((status)::text = 'active'::text)",
    )
    op.create_index("ix_sessions_learner_id", "sessions", ["learner_id"], unique=False)
    op.create_table(
        "stage_progress",
        sa.Column("id", sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column("session_id", sa.UUID(), autoincrement=False, nullable=False),
        sa.Column("stage_index", sa.INTEGER(), autoincrement=False, nullable=False),
        sa.Column("stage_key", sa.VARCHAR(length=64), autoincrement=False, nullable=False),
        sa.Column("status", sa.VARCHAR(length=32), autoincrement=False, nullable=False),
        sa.Column("turn_count", sa.INTEGER(), autoincrement=False, nullable=False),
        sa.Column("principle_label", sa.VARCHAR(length=16), autoincrement=False, nullable=False),
        sa.Column("position_shifted", sa.BOOLEAN(), autoincrement=False, nullable=False),
        sa.Column(
            "started_at", postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True
        ),
        sa.Column(
            "ended_at", postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True
        ),
        sa.ForeignKeyConstraint(
            ["session_id"], ["sessions.id"], name="stage_progress_session_id_fkey"
        ),
        sa.PrimaryKeyConstraint("id", name="stage_progress_pkey"),
        sa.UniqueConstraint(
            "session_id", "stage_index", name="stage_progress_session_id_stage_index_key"
        ),
    )
    op.create_index("ix_stage_progress_session_id", "stage_progress", ["session_id"], unique=False)
    op.create_table(
        "transcript_drafts",
        sa.Column("id", sa.UUID(), autoincrement=False, nullable=False),
        sa.Column("session_id", sa.UUID(), autoincrement=False, nullable=False),
        sa.Column("learner_id", sa.UUID(), autoincrement=False, nullable=False),
        sa.Column("text", sa.TEXT(), autoincrement=False, nullable=False),
        sa.Column("adapter", sa.VARCHAR(length=64), autoincrement=False, nullable=False),
        sa.Column("locale", sa.VARCHAR(length=32), autoincrement=False, nullable=False),
        sa.Column(
            "confidence", sa.DOUBLE_PRECISION(precision=53), autoincrement=False, nullable=True
        ),
        sa.Column("status", sa.VARCHAR(length=16), autoincrement=False, nullable=False),
        sa.Column(
            "created_at", postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=False
        ),
        sa.Column(
            "confirmed_at", postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True
        ),
        sa.Column(
            "discarded_at", postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True
        ),
        sa.ForeignKeyConstraint(
            ["learner_id"], ["learners.id"], name="transcript_drafts_learner_id_fkey"
        ),
        sa.ForeignKeyConstraint(
            ["session_id"], ["sessions.id"], name="transcript_drafts_session_id_fkey"
        ),
        sa.PrimaryKeyConstraint("id", name="transcript_drafts_pkey"),
    )
    op.create_index(
        "ix_transcript_drafts_session_id", "transcript_drafts", ["session_id"], unique=False
    )
    op.create_index(
        "ix_transcript_drafts_learner_id", "transcript_drafts", ["learner_id"], unique=False
    )
    op.create_table(
        "interaction_events",
        sa.Column("id", sa.UUID(), autoincrement=False, nullable=False),
        sa.Column("session_id", sa.UUID(), autoincrement=False, nullable=False),
        sa.Column("learner_id", sa.UUID(), autoincrement=False, nullable=False),
        sa.Column("event_type", sa.VARCHAR(length=64), autoincrement=False, nullable=False),
        sa.Column(
            "payload", postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=False
        ),
        sa.Column(
            "created_at", postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["learner_id"], ["learners.id"], name="interaction_events_learner_id_fkey"
        ),
        sa.ForeignKeyConstraint(
            ["session_id"], ["sessions.id"], name="interaction_events_session_id_fkey"
        ),
        sa.PrimaryKeyConstraint("id", name="interaction_events_pkey"),
    )
    op.create_index(
        "ix_interaction_events_session_id", "interaction_events", ["session_id"], unique=False
    )
    op.create_index(
        "ix_interaction_events_learner_id", "interaction_events", ["learner_id"], unique=False
    )
    op.create_index(
        "ix_interaction_events_event_type", "interaction_events", ["event_type"], unique=False
    )
    op.create_table(
        "summaries",
        sa.Column("session_id", sa.UUID(), autoincrement=False, nullable=False),
        sa.Column("core_principle", sa.TEXT(), autoincrement=False, nullable=False),
        sa.Column("tension", sa.TEXT(), autoincrement=False, nullable=False),
        sa.Column(
            "stance_by_stage",
            postgresql.JSONB(astext_type=sa.Text()),
            autoincrement=False,
            nullable=False,
        ),
        sa.Column("shifted", sa.BOOLEAN(), autoincrement=False, nullable=False),
        sa.Column(
            "raw", postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=False
        ),
        sa.Column(
            "created_at", postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=False
        ),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], name="summaries_session_id_fkey"),
        sa.PrimaryKeyConstraint("session_id", name="summaries_pkey"),
    )
    op.create_table(
        "messages",
        sa.Column("id", sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column("session_id", sa.UUID(), autoincrement=False, nullable=False),
        sa.Column("seq", sa.INTEGER(), autoincrement=False, nullable=False),
        sa.Column("stage_index", sa.INTEGER(), autoincrement=False, nullable=False),
        sa.Column("role", sa.VARCHAR(length=16), autoincrement=False, nullable=False),
        sa.Column("content", sa.TEXT(), autoincrement=False, nullable=False),
        sa.Column(
            "observations",
            postgresql.JSONB(astext_type=sa.Text()),
            autoincrement=False,
            nullable=True,
        ),
        sa.Column(
            "created_at", postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=False
        ),
        sa.Column(
            "retry_count",
            sa.INTEGER(),
            server_default=sa.text("0"),
            autoincrement=False,
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], name="messages_session_id_fkey"),
        sa.PrimaryKeyConstraint("id", name="messages_pkey"),
        sa.UniqueConstraint("session_id", "seq", name="messages_session_id_seq_key"),
    )
    op.create_index("ix_messages_session_id", "messages", ["session_id"], unique=False)
