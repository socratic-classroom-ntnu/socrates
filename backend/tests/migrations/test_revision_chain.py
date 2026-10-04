from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory


VERSIONS = Path("migrations/versions")


def test_run2_migration_extends_the_round1_head() -> None:
    script = ScriptDirectory.from_config(Config("alembic.ini"))

    # 單一 head：分岔會讓 `alembic upgrade head` 在部署時失敗。
    assert len(script.get_heads()) == 1
    # Run 2 接在 Round 1 的最後一支上，而不是另起一條鏈。
    assert script.get_revision("0006").down_revision == "9a0c1d2e3f42"


def test_base_schema_migrations_are_self_contained() -> None:
    for filename in (
        "0006_classroom_run2.py",
        "0073_portal_classroom_assets.py",
    ):
        source = (VERSIONS / filename).read_text(encoding="utf-8")
        assert "from app." not in source
        assert "import app." not in source
        assert ".metadata.create_all" not in source
        assert "create_all(" not in source


def test_revision_0006_cannot_absorb_later_feature_tables() -> None:
    source = (VERSIONS / "0006_classroom_run2.py").read_text(encoding="utf-8")

    for later_prefix in ("r73_", "r88_", "r97_", "r104_"):
        assert later_prefix not in source


def test_feature_tables_remain_in_their_owned_revisions() -> None:
    assert "r73_classroom_assets" in (VERSIONS / "0073_portal_classroom_assets.py").read_text(
        encoding="utf-8"
    )
    assert "r88_ai_students" in (VERSIONS / "0088_portal_ai_students.py").read_text(
        encoding="utf-8"
    )
    assert "r97_provider_profiles" in (VERSIONS / "0097_provider_profiles.py").read_text(
        encoding="utf-8"
    )
    assert "r104_mail_delivery" in (VERSIONS / "0104_resend_mail_delivery.py").read_text(
        encoding="utf-8"
    )
