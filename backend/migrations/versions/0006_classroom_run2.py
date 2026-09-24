"""Add Run2 tables while retaining Round1 data and routes."""

from alembic import op
from app.run2.storage import Base

revision = "0006"
down_revision = "9a0c1d2e3f42"
branch_labels = None
depends_on = None


def upgrade():
    Base.metadata.create_all(bind=op.get_bind())


def downgrade():
    raise RuntimeError("Run2 data is retained. Use an reviewed data migration for schema rollback.")
