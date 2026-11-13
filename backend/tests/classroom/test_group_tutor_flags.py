"""The group class's personal_tutor reports the same ten flags as the solo activity."""

import json

from app.modules.llm_runtime import iron_rules, prompts
from app.modules.llm_runtime.contracts import GroupTutorTurn, PersonalTutorTurn, SoloFlags


def test_the_group_personal_tutor_asks_for_flags_and_solo_does_not():
    programs = json.loads((prompts.ROOT / "prompts/classroom/programs.json").read_text())[
        "programs"
    ]
    assert prompts.SCHEMAS[programs["personal_tutor"]["schema"]] is GroupTutorTurn
    assert prompts.SCHEMAS[programs["solo_tutor"]["schema"]] is PersonalTutorTurn
    assert "flags" in programs["personal_tutor"]["template"]


def test_flags_extend_the_personal_turn_so_existing_readers_keep_working():
    assert issubclass(GroupTutorTurn, PersonalTutorTurn)
    assert GroupTutorTurn.model_fields["flags"].annotation is SoloFlags
    assert GroupTutorTurn.model_fields["flags"].is_required()


def test_the_group_tutor_rules_define_every_flag_and_never_mention_them():
    rules = iron_rules.rules_for("personal_tutor")
    for flag in SoloFlags.model_fields:
        assert f"  - {flag} " in rules, flag
    assert "回覆裡不提到任何 flag" in rules
    assert "solo_tutor" not in rules and "flags" not in iron_rules.rules_for("solo_tutor")
