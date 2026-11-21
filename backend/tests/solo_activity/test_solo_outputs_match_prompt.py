"""The solo_tutor prompt's output schema is llm_runtime's PersonalTutorTurn itself, not a copy."""

import json

from app.modules.llm_runtime.contracts import PersonalTutorTurn
from app.modules.llm_runtime.prompts import ROOT, SCHEMAS


def test_solo_tutor_schema_is_personal_tutor_turn():
    spec = json.loads((ROOT / "prompts/classroom/programs.json").read_text())
    assert SCHEMAS[spec["programs"]["solo_tutor"]["schema"]] is PersonalTutorTurn


def test_personal_tutor_schema_accepts_new_fields():
    """hypothetical tags an extended scenario; principle_note defaults so older outputs still load."""
    turn = PersonalTutorTurn.model_validate(
        {
            "reply_text": "如果換成你認識的人呢？",
            "observations": {
                "has_position": True,
                "has_reason": True,
                "reason_tested": False,
                "position_shifted": False,
                "principle_label": "義務論",
            },
            "move": "hypothetical",
            "summary": {"current_position": "不拉", "reason_summary": "不能主動害人"},
        }
    )
    assert turn.move == "hypothetical"
    assert turn.summary.principle_note == ""


def test_the_focused_tutor_keeps_its_own_moves():
    def moves(model) -> list[str]:
        return sorted(model.model_json_schema()["properties"]["move"]["enum"])

    assert "hypothetical" in moves(PersonalTutorTurn)
    # The focused tutor (group stage dialogue) keeps its own moves.
    assert "hypothetical" not in moves(SCHEMAS["TutorTurn"])
