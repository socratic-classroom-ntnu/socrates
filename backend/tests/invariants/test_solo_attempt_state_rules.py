"""單人活動狀態機的兩條底線（solo_activity/attempt_machine.py）。

- 設計規格 §8：結束（completed）之後任何動作一律拒絕。
- 設計規格 §4.5：問到上限仍未達成，不得假裝達成。單人活動沒有 capped 狀態：
  到了訊息上限就不能再送，題目維持 in_progress；只有學生自己確認整理卡才標 goal_met。
"""

from typing import get_args

import pytest

from app.modules.llm_runtime.contracts import Observations, PersonalSummary, PersonalTutorTurn
from app.modules.platform.errors import DomainError
from app.modules.solo_activity import attempt_machine as sm
from app.modules.solo_activity.contracts import SoloAction
from tests.solo_activity.test_solo_attempts_api import MET, OPENING, do, ok, setup, stance, start

OPTIONS = {"o0", "o1"}
T0 = 1_000.0


def turn(**observed) -> PersonalTutorTurn:
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
        summary=PersonalSummary(current_position="不拉", reason_summary="不能把人當工具"),
    )


def in_dialogue() -> sm.AttemptState:
    a, pending = sm.submit_stance(
        sm.new_attempt("att-1", ["q0"]), "o1", "不能主動害人", OPTIONS, T0
    )
    result = sm.apply_tutor_turn(a, pending.key, turn())
    assert result is not None and result.state == "in_dialogue"
    return result


def completed() -> sm.AttemptState:
    a, pending = sm.send_message(in_dialogue(), T0)
    confirming = sm.apply_tutor_turn(a, pending.key, turn())
    assert confirming is not None and confirming.state == "confirming"
    reviewing = sm.confirm_viewpoint(confirming, confirming.current.summary_digest or "")
    return sm.submit_review(reviewing)


TRANSITIONS = {
    "submit_stance": lambda a: sm.submit_stance(a, "o0", "還想再選", OPTIONS, T0),
    "send_message": lambda a: sm.send_message(a, T0),
    "retry": lambda a: sm.retry(a, T0 + 10 * sm.STALE_SECONDS),
    "confirm_viewpoint": lambda a: sm.confirm_viewpoint(a, a.current.summary_digest or "x"),
    "revise_viewpoint": sm.revise_viewpoint,
    "next_question": sm.next_question,
    "submit_review": sm.submit_review,
}


@pytest.mark.parametrize("action", sorted(TRANSITIONS))
def test_a_completed_attempt_rejects_every_transition(action):
    done = completed()
    assert done.state == "completed"
    assert sm.actions_for(done, T0) == []
    with pytest.raises(DomainError) as error:
        TRANSITIONS[action](done)
    assert error.value.code == "SOLO_ACTION_UNAVAILABLE"


def test_a_late_tutor_reply_does_not_reopen_a_completed_attempt():
    done = completed()
    assert sm.apply_tutor_turn(done, "att-1:0:1:0", turn()) is None
    assert sm.tutor_failed(done, "att-1:0:1:0", "tutor_unavailable") is None


def test_the_api_rejects_every_action_after_completion(client, tutor):
    _, replies = tutor
    attempt = ok(start(client, setup(client)["activity_id"]))
    replies.append(OPENING)
    stance(client, attempt["id"])
    replies.append(MET)
    view = ok(do(client, attempt["id"], "send_message", {"text": "因為是我親手造成的"}))
    digest = view["summary_digest"]
    ok(do(client, attempt["id"], "confirm_viewpoint", {"summary_digest": digest}))
    done = ok(do(client, attempt["id"], "submit_review"))
    assert (done["state"], done["available_actions"]) == ("completed", [])

    bodies = {
        "submit_stance": {"option_id": "o1", "reason": "還想再說"},
        "send_message": {"text": "還想再說"},
        "confirm_viewpoint": {"summary_digest": digest},
    }
    for action in get_args(SoloAction):
        response = do(client, attempt["id"], action, bodies.get(action))
        assert (response.status_code, response.json()) == (
            409,
            {"detail": "SOLO_ACTION_UNAVAILABLE"},
        ), action
    assert ok(client.get(f"/api/v2/solo/attempts/{attempt['id']}")) == done


def test_the_message_limit_never_marks_the_question_goal_met():
    a = in_dialogue()
    while True:
        try:
            a, pending = sm.send_message(a, T0)
        except DomainError as error:
            assert error.code == "SOLO_MESSAGE_LIMIT"
            break
        # The tutor never finds the goal met, however long the dialogue runs.
        result = sm.apply_tutor_turn(a, pending.key, turn(reason_tested=False))
        assert result is not None
        a = result
    assert a.current.turn_index + 1 == sm.MESSAGE_LIMIT
    assert a.state == "in_dialogue"
    assert a.current.status == "in_progress"
    assert a.current.confirmed_summary is None


def test_only_the_students_confirmation_marks_goal_met():
    a, pending = sm.send_message(in_dialogue(), T0)
    confirming = sm.apply_tutor_turn(a, pending.key, turn())
    assert confirming is not None and confirming.state == "confirming"
    # The policy allowing confirmation is not yet the student agreeing with the summary.
    assert confirming.current.status == "in_progress"
    revised = sm.revise_viewpoint(confirming)
    assert revised.current.status == "in_progress"
    confirmed = sm.confirm_viewpoint(confirming, confirming.current.summary_digest or "")
    assert confirmed.current.status == "goal_met"
