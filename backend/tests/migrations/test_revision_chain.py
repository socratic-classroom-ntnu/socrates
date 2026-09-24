from alembic.config import Config
from alembic.script import ScriptDirectory


def test_run2_migration_extends_the_round1_head() -> None:
    script = ScriptDirectory.from_config(Config("alembic.ini"))

    assert script.get_heads() == ["0006"]
    assert script.get_revision("0006").down_revision == "9a0c1d2e3f42"
