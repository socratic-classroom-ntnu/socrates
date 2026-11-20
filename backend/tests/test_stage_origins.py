"""The team stage stack must default to the team hosts.

Personal review hosts use their own override file outside the repository; the tracked
compose defaults and .env.example stay on the team stage origin.
"""

from pathlib import Path
import re

import pytest

STAGE = Path(__file__).resolve().parents[2] / "deploy" / "stage"
TEAM_ORIGIN = "https://socrates.driseam.com"


def _stage_file(name: str) -> str:
    path = STAGE / name
    if not path.exists():
        pytest.skip(f"{path} is not part of this checkout")
    return path.read_text(encoding="utf-8")


@pytest.mark.parametrize("key", ["SOCRATES_PUBLIC_ORIGIN", "SOCRATES_ALLOWED_ORIGINS"])
def test_stage_compose_defaults_to_team_origin(key):
    compose = _stage_file("compose.yml")
    match = re.search(rf"^\s+{key}: \$\{{{key}:-([^}}]*)\}}\s*$", compose, re.MULTILINE)
    assert match, f"{key} must keep an overridable default in deploy/stage/compose.yml"
    assert match.group(1) == TEAM_ORIGIN


@pytest.mark.parametrize("key", ["SOCRATES_PUBLIC_ORIGIN", "SOCRATES_ALLOWED_ORIGINS"])
def test_stage_env_example_matches_compose_default(key):
    example = _stage_file(".env.example")
    match = re.search(rf"^{key}=(.*)$", example, re.MULTILINE)
    assert match
    assert match.group(1).strip() == TEAM_ORIGIN


def test_stage_compose_passes_every_practice_setting_the_backend_reads():
    """我的對話的設定都要能從 stage `.env` 帶進容器，否則設了不會生效、錯的值也擋不下來（M3、M11）。"""
    app = Path(__file__).resolve().parents[1] / "app"
    read = set()
    for source in app.rglob("*.py"):
        read |= set(
            re.findall(
                r"SOCRATES_PRACTICE_[A-Z]+(?:_[A-Z]+)*\b", source.read_text(encoding="utf-8")
            )
        )
    read = {name for name in read if not name.endswith("_")}
    compose = _stage_file("compose.yml")
    example = _stage_file(".env.example")
    assert read, "no practice settings found"
    for name in sorted(read):
        assert re.search(
            rf"^\s+{name}: \$\{{{name}", compose, re.M
        ), f"{name} missing from compose.yml"
        assert re.search(rf"^{name}=", example, re.M), f"{name} missing from .env.example"
