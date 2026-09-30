"""Classroom asset containers and complete group Session history."""
from alembic import op
from app.run2.portal_classroom_library import ClassroomAssets,SessionLink,LibraryReceipt
revision='0073_portal'
down_revision='0006'
branch_labels=None
depends_on=None

def upgrade():
    for model in (ClassroomAssets,SessionLink,LibraryReceipt):
        model.__table__.create(bind=op.get_bind(),checkfirst=True)

def downgrade():
    raise RuntimeError('CLASSROOM_DATA_RESTORE_RECEIPT_REQUIRED')
