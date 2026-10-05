import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from alembic.util import CommandError

# 2026-10-05 合併成 0010 的 6 支。任何停在這些 revision 的資料庫都是舊名稱的 schema。
SQUASHED = ("0006", "0007", "0073_portal", "0088", "0097", "0104")


def _script() -> ScriptDirectory:
    return ScriptDirectory.from_config(Config("alembic.ini"))


def test_classroom_migration_extends_the_round1_head() -> None:
    script = _script()

    # 單一 head：分岔會讓 `alembic upgrade head` 在部署時失敗。
    assert script.get_heads() == ["0010"]
    # 教室的 schema 接在 Round 1 的最後一支上，而不是另起一條鏈。
    assert script.get_revision("0010").down_revision == "9a0c1d2e3f42"


@pytest.mark.parametrize("revision", SQUASHED)
def test_a_database_left_on_a_squashed_revision_fails_loudly(revision: str) -> None:
    """Reusing an old id would let such a database think it is at head with the old names."""
    with pytest.raises(CommandError, match="Can't locate revision"):
        _script().get_revision(revision)
