import pytest
from pydantic import ValidationError

from app.run2.contracts import Observations, TutorTurn

FULL = {
    "has_position": True,
    "has_reason": True,
    "reason_tested": False,
    "position_shifted": False,
    "principle_label": "未明",
}


def turn(observations):
    return {"reply_text": "x", "observations": observations, "move": "probe", "micro_summary": ""}


def test_every_observation_field_is_required_in_the_schema():
    assert set(Observations.model_json_schema().get("required", [])) == set(FULL)


@pytest.mark.parametrize("missing", sorted(FULL))
def test_tutor_turn_rejects_a_reply_missing_any_observation_field(missing):
    observations = {k: v for k, v in FULL.items() if k != missing}
    with pytest.raises(ValidationError):
        TutorTurn.model_validate(turn(observations))


def test_tutor_turn_accepts_complete_observations():
    TutorTurn.model_validate(turn(FULL))
