"""Add courses, enrollments, activities, and immutable activity revisions.

Self-contained DDL matching course_management repositories as of 2026-10-19.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("locale", sa.String(length=8), nullable=True))

    op.create_table(
        "courses",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("owner_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("teacher_name", sa.String(length=64), nullable=False),
        sa.Column("intro", sa.Text(), nullable=False),
        sa.Column("goals", sa.Text(), nullable=False),
        sa.Column("code", sa.String(length=8), nullable=False),
        sa.Column("code_enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.Float(), nullable=False),
        sa.Column("updated_at", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["accounts.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index(op.f("ix_courses_owner_id"), "courses", ["owner_id"], unique=False)

    op.create_table(
        "enrollments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("course_id", sa.String(length=36), nullable=False),
        sa.Column("account_id", sa.String(length=36), nullable=False),
        sa.Column("display_name", sa.String(length=40), nullable=False),
        sa.Column("created_at", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"]),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("course_id", "account_id", name="uq_enrollments_course_account"),
    )
    op.create_index(op.f("ix_enrollments_account_id"), "enrollments", ["account_id"], unique=False)
    op.create_index(op.f("ix_enrollments_course_id"), "enrollments", ["course_id"], unique=False)

    op.create_table(
        "activities",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("course_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("draft", sa.JSON(), nullable=False),
        sa.Column("starts_at", sa.Float(), nullable=True),
        sa.Column("ends_at", sa.Float(), nullable=True),
        sa.Column("published_at", sa.Float(), nullable=True),
        sa.Column("current_revision_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.Float(), nullable=False),
        sa.Column("updated_at", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_activities_course_id"), "activities", ["course_id"], unique=False)

    op.create_table(
        "activity_revisions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("activity_id", sa.String(length=36), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("content", sa.JSON(), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("locked_at", sa.Float(), nullable=True),
        sa.Column("created_at", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["activity_id"], ["activities.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "activity_id",
            "number",
            name="uq_activity_revisions_activity_number",
        ),
    )
    op.create_index(
        op.f("ix_activity_revisions_activity_id"),
        "activity_revisions",
        ["activity_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_activities_current_revision",
        "activities",
        "activity_revisions",
        ["current_revision_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_activities_current_revision", "activities", type_="foreignkey")
    op.drop_index(op.f("ix_activity_revisions_activity_id"), table_name="activity_revisions")
    op.drop_table("activity_revisions")
    op.drop_index(op.f("ix_activities_course_id"), table_name="activities")
    op.drop_table("activities")
    op.drop_index(op.f("ix_enrollments_course_id"), table_name="enrollments")
    op.drop_index(op.f("ix_enrollments_account_id"), table_name="enrollments")
    op.drop_table("enrollments")
    op.drop_index(op.f("ix_courses_owner_id"), table_name="courses")
    op.drop_table("courses")
    op.drop_column("accounts", "locale")
