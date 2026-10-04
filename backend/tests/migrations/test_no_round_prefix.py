"""Names say what a thing holds, not which development round added it."""

import re

from app import interaction_models, models  # noqa: F401
from app.db import Base as RoundOneBase
from app.run2 import storage

# Matches r2_accounts, ix_r104_mail_delivery_purpose and fk_r88_ai_student_provider_profile alike.
ROUND_PREFIX = re.compile(r"(^|_)r[0-9]+_")


def _schema_names():
    storage.register_models()
    for metadata in (RoundOneBase.metadata, storage.Base.metadata):
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
