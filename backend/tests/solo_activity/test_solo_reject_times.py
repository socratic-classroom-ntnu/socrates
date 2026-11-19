"""Item 8: every 不太對 on a scenario's summary is stored with its time, for the teacher's transcript.

The times live in the scenario's own progress, one per press and never overwritten. The student's
own view carries none of it: only the teacher's transcript reads it.
"""

from sqlalchemy import select

from app.modules.platform import storage
from app.modules.solo_activity import attempt_machine as sm
from app.modules.solo_activity.repositories import SoloAttempt
from tests.solo_activity.test_solo_attempts_api import (
    MET,
    NOT_MET,
    do,
    ok,
    setup,
    start,
    to_confirming,
)
from tests.solo_activity.test_solo_state_table import T0, confirming, turn


def confirming_again(a: sm.AttemptState) -> sm.AttemptState:
    """Turned down once: the tutor asks at least once more (nothing to confirm yet), then asks again."""
    a, pending = sm.send_message(a, "再說一點", T0, revise_hint="reason")
    a = sm.apply_tutor_turn(a, pending.key, turn(reason_tested=False))
    assert a is not None and a.state == "in_dialogue"
    a, pending = sm.send_message(a, "再說一次", T0)
    result = sm.apply_tutor_turn(a, pending.key, turn())
    assert result is not None and result.state == "confirming"
    return result


# ---- the machine ---------------------------------------------------------------------------


def test_a_scenario_starts_with_no_rejections():
    assert confirming().current.rejected_at == []


def test_pressing_不太對_records_the_time():
    revised = sm.revise_viewpoint(confirming(), 1_234.5)
    assert revised.current.rejected_at == [1_234.5]


def test_every_press_adds_one_and_none_is_overwritten():
    first = sm.revise_viewpoint(confirming(), 1_000.0)
    second = sm.revise_viewpoint(confirming_again(first), 2_000.0)
    assert second.current.rejected_at == [1_000.0, 2_000.0]


def test_the_times_belong_to_their_own_scenario():
    a = sm.revise_viewpoint(confirming(2), 1_000.0)
    assert a.progress[0].rejected_at == [1_000.0]
    assert a.progress[1].rejected_at == []


def test_without_a_time_nothing_is_recorded():
    # The invariants table calls revise_viewpoint with the attempt only.
    assert sm.revise_viewpoint(confirming()).current.rejected_at == []


# ---- over HTTP -----------------------------------------------------------------------------


def stored_rejections(attempt_id: str) -> list[list[float]]:
    with storage.transaction() as db:
        row = db.scalars(select(SoloAttempt).where(SoloAttempt.id == attempt_id)).one()
        return [entry["rejected_at"] for entry in row.progress]


def test_two_presses_over_the_api_store_two_times(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    view = to_confirming(client, attempt["id"], replies)
    ok(do(client, attempt["id"], "revise_viewpoint"))
    replies.append(NOT_MET)
    ok(do(client, attempt["id"], "send_message", {"text": "還有一點", "revise_hint": "reason"}))
    replies.append(MET)
    view = ok(do(client, attempt["id"], "send_message", {"text": "我再說清楚一點"}))
    assert view["state"] == "confirming"
    ok(do(client, attempt["id"], "revise_viewpoint"))

    (times,) = stored_rejections(attempt["id"])
    assert len(times) == 2 and times[0] <= times[1]


def test_the_students_own_view_has_no_rejection_times(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    to_confirming(client, attempt["id"], replies)
    view = ok(do(client, attempt["id"], "revise_viewpoint"))
    assert "rejected_at" not in view["scenarios"][0]
    assert "rejected_at" not in str(view)


def test_an_attempt_saved_before_this_still_loads():
    entry = {"scenario_id": "s1", "text": "情境"}  # no rejected_at, as every older row
    assert sm.ScenarioProgress(**entry).rejected_at == []
