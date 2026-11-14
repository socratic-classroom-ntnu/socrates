"""The message limit: the student is never left with only an action that is bound to fail.

When a scenario has used its last message and the tutor still has no summary to offer, the current
summary is shown for confirmation and the scenario is marked ``capped``, never ``goal_met``
(AGENTS.md: 上限到了未達成標 capped 不標 goal_met). Nothing more can be said in that scenario, so
不太對 is not offered either.
"""

import pytest

from app.modules.platform.errors import DomainError
from app.modules.solo_activity import attempt_machine as sm
from tests.solo_activity.test_solo_attempts_api import (
    NOT_MET,
    answer,
    confirm,
    do,
    ok,
    setup,
    start,
)
from tests.solo_activity.test_solo_progress_api import progress, student_row
from tests.solo_activity.test_solo_state_table import T0, fresh, in_dialogue, turn
from tests.course_management.conftest import switch

LIMIT = 3  # student messages per scenario in these tests: the answer, then two more


@pytest.fixture(autouse=True)
def small_limit(monkeypatch):
    monkeypatch.setattr(sm, "MESSAGE_LIMIT", LIMIT)


def reply(a: sm.AttemptState, **observed) -> sm.AttemptState:
    a, pending = sm.send_message(a, "回覆", T0)
    result = sm.apply_tutor_turn(a, pending.key, turn(**observed))
    assert result is not None
    return result


def talk_to_the_last_message(count: int = 1) -> sm.AttemptState:
    """The answer and every message but the last, none of them settling the scenario."""
    a, pending = sm.send_message(fresh(count), "回答", T0)
    a = sm.apply_tutor_turn(a, pending.key, turn(reason_tested=False))  # type: ignore[assignment]
    for _ in range(LIMIT - 2):
        a = reply(a, reason_tested=False)
    assert a.state == "in_dialogue" and a.current.turn_index == LIMIT - 2
    return a


def test_below_the_limit_a_reply_that_settles_nothing_keeps_the_dialogue():
    a = talk_to_the_last_message()
    assert a.state == "in_dialogue"
    assert sm.actions_for(a, T0) == ["send_message"]


def test_the_last_message_without_a_summary_shows_the_current_one_as_capped():
    a = reply(talk_to_the_last_message(), reason_tested=False)
    assert a.state == "confirming"
    assert a.current.status == "capped"
    assert a.current.candidate_summary is not None
    assert a.current.summary_digest is not None
    assert sm.actions_for(a, T0) == ["confirm_viewpoint"]


def test_a_capped_summary_cannot_be_turned_down():
    a = reply(talk_to_the_last_message(), reason_tested=False)
    assert a.state == "confirming"
    with pytest.raises(DomainError) as error:
        sm.revise_viewpoint(a)
    assert (error.value.code, error.value.status) == ("SOLO_ACTION_UNAVAILABLE", 409)


def test_confirming_a_capped_summary_leaves_it_capped_and_unconfirmed():
    a = reply(talk_to_the_last_message(), reason_tested=False)
    done = sm.confirm_viewpoint(a, a.current.summary_digest or "")
    assert done.current.status == "capped"
    assert done.current.confirmed_summary is None
    assert done.current.candidate_summary is None
    assert done.state == "reviewing"  # the only scenario


def test_a_capped_scenario_does_not_count_towards_concluding():
    a = reply(talk_to_the_last_message(count=2), reason_tested=False)
    a = sm.confirm_viewpoint(a, a.current.summary_digest or "")
    assert a.state == "between_scenarios"
    assert [p.status for p in a.progress] == ["capped", "in_progress"]


def test_a_summary_reached_on_the_last_message_is_confirmed_not_capped():
    a = reply(talk_to_the_last_message())
    assert a.state == "confirming"
    assert a.current.status == "in_progress"
    assert sm.actions_for(a, T0) == ["confirm_viewpoint"]  # no message is left to revise with
    done = sm.confirm_viewpoint(a, a.current.summary_digest or "")
    assert done.current.status == "goal_met"
    assert done.current.confirmed_summary is not None


def test_before_the_last_message_a_summary_can_still_be_turned_down():
    a = reply(in_dialogue())
    assert a.state == "confirming"
    assert sm.actions_for(a, T0) == ["confirm_viewpoint", "revise_viewpoint"]
    assert sm.revise_viewpoint(a).state == "in_dialogue"


@pytest.mark.parametrize(("count", "state"), [(1, "reviewing"), (2, "between_scenarios")])
def test_a_pulled_back_last_reply_has_nothing_to_confirm_so_the_sequence_moves_on(count, state):
    a = talk_to_the_last_message(count)
    a, pending = sm.send_message(a, "回覆", T0)
    result = sm.apply_pulled_back_turn(a, pending.key)
    assert result is not None
    assert result.current.status == "capped"
    assert result.current.candidate_summary is None and result.current.confirmed_summary is None
    assert result.state == state


def capped_attempt(client, replies):
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(NOT_MET)
    answer(client, attempt["id"])
    replies.append(NOT_MET)
    ok(do(client, attempt["id"], "send_message", {"text": "我再想想"}))
    replies.append(NOT_MET)
    view = ok(do(client, attempt["id"], "send_message", {"text": "還是不確定"}))
    return s, attempt["id"], view


def test_the_student_sees_the_capped_summary_and_can_only_confirm(client, tutor):
    _, replies = tutor
    _, attempt_id, view = capped_attempt(client, replies)
    assert view["state"] == "confirming"
    assert view["scenarios"][0]["status"] == "capped"
    assert view["candidate_summary"] is not None
    assert view["available_actions"] == ["confirm_viewpoint"]

    done = confirm(client, attempt_id, view)
    assert done["state"] == "reviewing"
    assert done["scenarios"][0]["status"] == "capped"
    assert done["scenarios"][0]["confirmed_summary"] is None
    assert done["available_actions"] == ["retry_reflection_prompt", "submit_review"]


def test_the_teacher_sees_a_capped_cell_and_no_confirmed_viewpoint(client, tutor):
    _, replies = tutor
    s, attempt_id, view = capped_attempt(client, replies)
    confirm(client, attempt_id, view)

    switch(client, s["teacher"])
    row = student_row(ok(progress(client, s["activity_id"])), "student同學")
    assert [c["status"] for c in row["cells"]] == ["capped"]
    analysis = ok(client.get(f"/api/v2/solo/activities/{s['activity_id']}/analysis"))
    assert student_row(analysis, "student同學")["confirmed_scenarios"] == 0
