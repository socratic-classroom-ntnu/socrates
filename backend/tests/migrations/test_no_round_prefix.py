"""Names say what a thing holds, not which development round added it."""

import re

from app.modules.app_shell import legacy_tables  # noqa: F401
from app.modules.platform.db import Base as LegacyBase
from app.modules.platform import storage as storage
from app.modules.app_shell.models import register_models

# Matches r2_accounts, ix_r104_mail_delivery_purpose and fk_r88_ai_student_provider_profile alike.
ROUND_PREFIX = re.compile(r"(^|_)r[0-9]+_")


def _schema_names():
    register_models()
    for metadata in (LegacyBase.metadata, storage.Base.metadata):
        for table in metadata.tables.values():
            yield table.name
            yield from (index.name for index in table.indexes if index.name)
            yield from (
                constraint.name
                for constraint in table.constraints
                if isinstance(constraint.name, str) and constraint.name
            )


def test_no_schema_name_carries_a_round_prefix():
    assert sorted(name for name in _schema_names() if ROUND_PREFIX.search(name)) == []
