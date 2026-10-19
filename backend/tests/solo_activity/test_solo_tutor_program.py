"""The solo_tutor prompt: B5's rules live there, and the group's personal_tutor is untouched."""

import json

from app.modules.llm_runtime.tutor.prompts import ROOT, validate_programs


def _template(kind: str) -> str:
    spec = json.loads((ROOT / "prompts/classroom/programs.json").read_text())
    return spec["programs"][kind]["template"]


def test_programs_validate():
    validate_programs()
    solo = _template("solo_tutor")
    for key in ("hypothetical", "principle_note", "revise_hint", "stance_changed_from"):
        assert key in solo, key


def test_group_personal_tutor_is_untouched():
    group = _template("personal_tutor")
    for key in ("principle_note", "revise_hint", "stance_changed_from"):
        assert key not in group, key
