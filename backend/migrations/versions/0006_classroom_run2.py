"""Add Run2 tables while retaining Round1 data and routes."""

from alembic import op
from app.run2.storage import Base

# alembic imports every revision module before running any of them, so 0073's import chain
# registers r88_ai_students — whose foreign key targets r97_provider_profiles — before the
# create_all below. Register that module here so the key resolves, and so a fresh database
# still gets the R97 tables from this migration (0097 documents and relies on that).
from app.run2 import provider_profiles  # noqa: F401,E402

revision = "0006"
down_revision = "9a0c1d2e3f42"
branch_labels = None
depends_on = None


def upgrade():
    Base.metadata.create_all(bind=op.get_bind())


def downgrade():
    raise RuntimeError("Run2 data is retained. Use an reviewed data migration for schema rollback.")
