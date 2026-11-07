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
