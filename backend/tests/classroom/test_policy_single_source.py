import itertools

import app.orchestrator.policy as round1
from app.domain.tutor import Observations
from app.orchestrator import classroom_policy as classroom

FIELDS = ("has_position", "has_reason", "reason_tested", "position_shifted")


def test_run2_delegates_to_the_round1_policy(monkeypatch):
    monkeypatch.setattr(round1, "should_advance", lambda obs, turn_count: True)
    obs = {f: False for f in FIELDS} | {"principle_label": "未明"}
    assert classroom.stage_goal(obs, 0) is True


def test_run2_matches_round1_truth_table():
    for values in itertools.product([False, True], repeat=4):
        for turns in (0, 1, 2):
            obs = dict(zip(FIELDS, values)) | {"principle_label": "未明"}
            expected = round1.should_advance(Observations.model_validate(obs), turns)
            assert classroom.stage_goal(obs, turns) is expected
