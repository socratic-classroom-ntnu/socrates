"""Add durable R88 LLM Student profiles."""

from alembic import op

revision = "0088"
down_revision = ("0007", "0073_portal")
branch_labels = None
depends_on = None


def upgrade():
    from app.run2.portal_ai_students import AIStudentProfile

    AIStudentProfile.__table__.create(bind=op.get_bind(), checkfirst=True)


def downgrade():
    # R88 actor evidence is retained for lesson provenance.
    pass
