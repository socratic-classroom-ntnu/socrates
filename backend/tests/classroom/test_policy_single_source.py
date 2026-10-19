import itertools

import app.modules.llm_runtime.policy as advance_policy
from app.modules.solo_dialogue.tutor_contracts import Observations
from app.modules.classroom_core import policy as classroom

FIELDS = ("has_position", "has_reason", "reason_tested", "position_shifted")


def test_classroom_delegates_to_the_advance_policy(monkeypatch):
    monkeypatch.setattr(advance_policy, "should_advance", lambda obs, turn_count: True)
    obs = {f: False for f in FIELDS} | {"principle_label": "未明"}
    assert classroom.stage_goal(obs, 0) is True


def test_classroom_matches_the_advance_policy_truth_table():
    for values in itertools.product([False, True], repeat=4):
        for turns in (0, 1, 2):
            obs = dict(zip(FIELDS, values)) | {"principle_label": "未明"}
            expected = advance_policy.should_advance(Observations.model_validate(obs), turns)
            assert classroom.stage_goal(obs, turns) is expected
