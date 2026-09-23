"""Add CE room transcript drafts and interaction evidence.

Revision ID: 9a0c1d2e3f42
Revises: 9a0c1d2e3f41
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "9a0c1d2e3f42"
down_revision: str | None = "9a0c1d2e3f41"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "transcript_drafts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("learner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("adapter", sa.String(length=64), nullable=False),
        sa.Column("locale", sa.String(length=32), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("discarded_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["learner_id"], ["learners.id"]),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_transcript_drafts_session_id", "transcript_drafts", ["session_id"])
    op.create_index("ix_transcript_drafts_learner_id", "transcript_drafts", ["learner_id"])
    op.create_table(
        "interaction_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("learner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["learner_id"], ["learners.id"]),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_interaction_events_session_id", "interaction_events", ["session_id"])
    op.create_index("ix_interaction_events_learner_id", "interaction_events", ["learner_id"])
    op.create_index("ix_interaction_events_event_type", "interaction_events", ["event_type"])


def downgrade() -> None:
    op.drop_index("ix_interaction_events_event_type", table_name="interaction_events")
    op.drop_index("ix_interaction_events_learner_id", table_name="interaction_events")
    op.drop_index("ix_interaction_events_session_id", table_name="interaction_events")
    op.drop_table("interaction_events")
    op.drop_index("ix_transcript_drafts_learner_id", table_name="transcript_drafts")
    op.drop_index("ix_transcript_drafts_session_id", table_name="transcript_drafts")
    op.drop_table("transcript_drafts")
