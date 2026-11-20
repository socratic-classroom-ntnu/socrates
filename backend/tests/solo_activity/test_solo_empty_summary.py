"""Item 12: a summary with nothing in it is never offered for confirmation.

Some models (Claude Haiku) write the tutor summary's current_position or reason_summary as an empty
string until the student has said something to summarise. The student must not be asked to confirm
a card with a blank on it: the dialogue goes on, even when the tutor reports the goal met. Out of
messages the scenario still goes to confirmation as capped, with the empty fields stored as they
came (the teacher's and the student's screens say 還沒說明).
"""

import pytest

from app.modules.llm_runtime.contracts import Observations, PersonalSummary, PersonalTutorTurn
from app.modules.solo_activity import attempt_machine as sm
from tests.solo_activity.test_solo_attempts_api import (
    MET,
    OPENING,
    answer,
    do,
    ok,
    setup,
    start,
)
from tests.solo_activity.test_solo_state_table import T0, fresh, in_dialogue

LIMIT = 3  # student messages per scenario in the capped tests: the answer, then two more


def tutor_turn(position="不拉", reason="不能把人當工具", **observed) -> PersonalTutorTurn:
    """A turn that reports the goal met, with the summary's two fields as given."""
    flags = {
        "has_position": True,
        "has_reason": True,
        "reason_tested": True,
        "position_shifted": False,
        "principle_label": "義務論",
        **observed,
    }
    return PersonalTutorTurn(
        reply_text="你說的「不能」是指什麼？",
        observations=Observations(**flags),
        summary=PersonalSummary(current_position=position, reason_summary=reason),
    )


def reply(a: sm.AttemptState, turn: PersonalTutorTurn) -> sm.AttemptState:
    a, pending = sm.send_message(a, "回覆", T0)
    result = sm.apply_tutor_turn(a, pending.key, turn)
    assert result is not None
    return result


# ---- before the last message: keep talking -------------------------------------------------


def test_a_summary_with_both_fields_is_offered_as_before():
    a = reply(in_dialogue(), tutor_turn())
    assert a.state == "confirming"
    assert a.current.candidate_summary is not None and a.current.summary_digest is not None


@pytest.mark.parametrize(
    ("position", "reason"),
    [
        ("", "不能把人當工具"),
        ("不拉", ""),
        ("", ""),
        ("   ", "不能把人當工具"),
        ("不拉", "\n\t "),
    ],
    ids=["no position", "no reason", "neither", "blank position", "blank reason"],
)
def test_an_empty_field_keeps_the_dialogue_even_when_the_goal_is_reported_met(position, reason):
    a = reply(in_dialogue(), tutor_turn(position, reason))
    assert a.state == "in_dialogue"
    assert a.current.candidate_summary is None
    assert a.current.summary_digest is None
    assert a.current.status == "in_progress"
    assert sm.actions_for(a, T0) == ["send_message"]


@pytest.mark.parametrize(
    ("summary", "complete"),
    [
        ({"current_position": "不拉", "reason_summary": "公平"}, True),
        ({"current_position": "", "reason_summary": "公平"}, False),
        ({"current_position": "不拉", "reason_summary": ""}, False),
        ({"current_position": "  \n", "reason_summary": "公平"}, False),
        ({"current_position": "不拉", "reason_summary": "\t"}, False),
        ({"current_position": "不拉"}, False),
    ],
)
def test_blank_space_is_not_a_word(summary, complete):
    assert sm._is_complete(summary) is complete


def test_the_next_reply_with_both_fields_can_still_settle_the_scenario():
    a = reply(in_dialogue(), tutor_turn("", ""))
    a = reply(a, tutor_turn())
    assert a.state == "confirming"
    assert a.current.status == "in_progress"
    done = sm.confirm_viewpoint(a, a.current.summary_digest or "")
    assert done.current.status == "goal_met"
    assert done.current.confirmed_summary is not None
    assert done.current.confirmed_summary["current_position"] == "不拉"
    assert done.current.confirmed_summary["reason_summary"] == "不能把人當工具"


def test_what_the_tutor_observed_on_a_held_back_turn_still_counts():
    a = reply(in_dialogue(), tutor_turn("", "", position_shifted=True))
    assert a.state == "in_dialogue"
    assert a.current.last_shift_turn == a.current.turn_index


def test_a_held_back_turn_still_counts_the_students_message():
    before = in_dialogue()
    a = reply(before, tutor_turn("", ""))
    assert a.current.turn_index == before.current.turn_index + 1  # the student's message counts


def test_a_turn_that_does_not_settle_the_view_is_not_changed_by_empty_fields():
    a = reply(in_dialogue(), tutor_turn("", "", reason_tested=False))
    assert a.state == "in_dialogue" and a.current.candidate_summary is None


# ---- on the last message: capped, the fields stored as they are ----------------------------


@pytest.fixture
def small_limit(monkeypatch):
    monkeypatch.setattr(sm, "MESSAGE_LIMIT", LIMIT)


def talk_to_the_last_message() -> sm.AttemptState:
    a, pending = sm.send_message(fresh(), "回答", T0)
    a = sm.apply_tutor_turn(a, pending.key, tutor_turn(reason_tested=False))  # type: ignore[assignment]
    for _ in range(LIMIT - 2):
        a = reply(a, tutor_turn(reason_tested=False))
    assert a.state == "in_dialogue" and a.current.turn_index == LIMIT - 2
    return a


def test_out_of_messages_the_empty_summary_still_goes_to_confirmation_as_capped(small_limit):
    a = reply(talk_to_the_last_message(), tutor_turn("", "", reason_tested=False))
    assert a.state == "confirming"
    assert a.current.status == "capped"
    assert a.current.candidate_summary is not None
    assert a.current.candidate_summary["current_position"] == ""
    assert a.current.candidate_summary["reason_summary"] == ""
    assert a.current.summary_digest is not None
    assert sm.actions_for(a, T0) == ["confirm_viewpoint"]


def test_out_of_messages_a_goal_reported_met_with_an_empty_field_is_capped_not_goal_met(
    small_limit,
):
    a = reply(talk_to_the_last_message(), tutor_turn("", "不能把人當工具"))
    assert a.state == "confirming"
    assert a.current.status == "capped"
    assert a.current.candidate_summary is not None
    assert a.current.candidate_summary["current_position"] == ""
    assert a.current.candidate_summary["reason_summary"] == "不能把人當工具"
    done = sm.confirm_viewpoint(a, a.current.summary_digest or "")
    assert done.current.status == "capped" and done.current.confirmed_summary is None


def test_out_of_messages_a_full_summary_on_a_met_goal_is_still_goal_met(small_limit):
    a = reply(talk_to_the_last_message(), tutor_turn())
    assert a.state == "confirming" and a.current.status == "in_progress"
    done = sm.confirm_viewpoint(a, a.current.summary_digest or "")
    assert done.current.status == "goal_met"


# ---- over HTTP -----------------------------------------------------------------------------

EMPTY = {**MET, "summary": {**MET["summary"], "current_position": "", "reason_summary": ""}}
ONE_EMPTY = {**MET, "summary": {**MET["summary"], "reason_summary": ""}}


@pytest.mark.parametrize("held_back", [EMPTY, ONE_EMPTY], ids=["both", "reason only"])
def test_the_student_stays_in_the_dialogue_when_the_summary_has_a_blank(client, tutor, held_back):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(OPENING)
    answer(client, attempt["id"])
    replies.append(held_back)
    view = ok(do(client, attempt["id"], "send_message", {"text": "因為是我親手造成的"}))
    assert view["state"] == "in_dialogue"
    assert view["candidate_summary"] is None and view["summary_digest"] is None
    assert view["available_actions"] == ["send_message"]
    assert view["scenarios"][0]["status"] == "in_progress"
    # The tutor's reply is kept and shown like any other.
    assert view["messages"][-1]["role"] == "tutor"
    assert view["messages"][-1]["text"] == held_back["reply_text"]

    replies.append(MET)
    view = ok(do(client, attempt["id"], "send_message", {"text": "再說清楚一點"}))
    assert view["state"] == "confirming"
    assert view["candidate_summary"]["current_position"] == MET["summary"]["current_position"]


def test_out_of_messages_over_the_api_the_blank_summary_is_shown_as_capped(
    client, tutor, small_limit
):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.append({**OPENING, "observations": {**OPENING["observations"], "reason_tested": False}})
    answer(client, attempt["id"])
    replies.append({**EMPTY, "observations": {**EMPTY["observations"], "reason_tested": False}})
    ok(do(client, attempt["id"], "send_message", {"text": "嗯"}))
    replies.append(EMPTY)
    view = ok(do(client, attempt["id"], "send_message", {"text": "最後一句"}))
    assert view["state"] == "confirming"
    assert view["scenarios"][0]["status"] == "capped"
    assert view["candidate_summary"]["current_position"] == ""
    assert view["candidate_summary"]["reason_summary"] == ""
    assert view["available_actions"] == ["confirm_viewpoint"]
