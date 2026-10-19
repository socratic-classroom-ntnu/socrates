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
    assert script.get_heads() == ["0013"]
    # 教室的 schema 接在 Round 1 的最後一支上，而不是另起一條鏈。
    assert script.get_revision("0010").down_revision == "9a0c1d2e3f42"
    # 題庫商店（issue #17）接在教室 schema 之後。
    assert script.get_revision("0011").down_revision == "0010"
    # 互動式 LLM 呼叫沿用同一張 audit 表，允許沒有 classroom Job 的紀錄。
    assert script.get_revision("0012").down_revision == "0011"
    # 長期課程、選課與活動版本沿用同一條 migration 鏈。
    assert script.get_revision("0013").down_revision == "0012"


@pytest.mark.parametrize("revision", SQUASHED)
def test_a_database_left_on_a_squashed_revision_fails_loudly(revision: str) -> None:
    """Reusing an old id would let such a database think it is at head with the old names."""
    with pytest.raises(CommandError, match="Can't locate revision"):
        _script().get_revision(revision)
