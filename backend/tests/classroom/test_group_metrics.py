"""Hsy 5: the group class's teacher analysis carries the solo activity's metrics and marks, computed
by the one pure function (solo_activity/metrics.py) from the personal tutor's flags."""

import json

from app.modules.analytics import group_analysis
from app.modules.analytics.group_analysis import analysis
from tests.classroom.test_group_personal import (
    FLAGS,
    SHIFTED,
    answer,
    entry,
    finish,
    reply,
    room,
    tutor,
)


def person(state, member_id):
    pseudonym = group_analysis.pseudonym("rid", member_id)
    body = analysis("rid", "個人對話", [state])
    return next(p for p in body["groups"][0]["persons"] if p["id"] == pseudonym), body


def test_a_danger_flag_marks_the_person_in_the_analysis():
    g = room()
    answer(g, "m1")
    finish(g, "m1", tutor())
    reply(g, "m1")
    finish(g, "m1", tutor(observations=SHIFTED, flags={**FLAGS, "danger_tendency": 1}))
    found, body = person(g.s, "m1")
    assert found["marks"] == ["danger_tendency"]
    assert found["metrics"]["judged_messages"] == 2
    assert found["metrics"]["position_shifts"] == 1
    # 100 × (0.6 × 1 + 0.4 × 1): both judged messages answered the tutor, neither was low effort.
    assert found["metrics"]["engagement"]["value"] == 100.0
    # The personal dialogue is private to the student: no message ids reach the teacher.
    assert found["mark_message_ids"] == [] and found["metrics"]["depth"]["message_ids"] == []
    other, _ = person(g.s, "m2")
    assert (other["metrics"], other["marks"]) == (None, [])
    assert "flags" not in json.dumps(body, ensure_ascii=False)


def test_the_numbers_come_from_the_solo_function(monkeypatch):
    seen = []

    def fake(judged, *, position_shifts, reason_tested):
        seen.append((len(judged), position_shifts, reason_tested))
        return {"metrics": None, "marks": [], "mark_message_ids": []}

    monkeypatch.setattr(group_analysis, "student_metrics", fake)
    g = room()
    answer(g, "m1")
    finish(g, "m1", tutor())
    person(g.s, "m1")
    assert (1, 0, True) in seen


def test_the_student_view_still_carries_no_flags():
    g = room()
    answer(g, "m1")
    finish(g, "m1", tutor(flags={**FLAGS, "malicious_off_topic": 1}))
    assert entry(g, "m1")["messages"][-1]["flags"]["malicious_off_topic"] == 1
    from app.modules.group_dialogue.group_run import personal_student_view

    assert "flags" not in json.dumps(personal_student_view(g.s, "m1"), ensure_ascii=False)
