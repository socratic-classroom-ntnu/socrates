from alembic.config import Config
from alembic.script import ScriptDirectory


def test_run2_migration_extends_the_round1_head() -> None:
    script = ScriptDirectory.from_config(Config("alembic.ini"))

    # 單一 head：分岔會讓 `alembic upgrade head` 在部署時失敗。
    assert len(script.get_heads()) == 1
    # Run 2 接在 Round 1 的最後一支上，而不是另起一條鏈。
    assert script.get_revision("0006").down_revision == "9a0c1d2e3f42"
