"""O5: after a confirmed scenario the sequence is extended with a scenario written for this student.

The first scenario is the teacher's text; every later one comes from ``scenario_extension`` and is
stored the moment it is written, so a refresh, a retry or a second click never gives another one.
When it cannot be written the student goes to the review: nobody waits for a scenario that is
not coming.
"""

import json

import pytest
from sqlalchemy import select

from app.modules.platform import storage as storage
from app.modules.platform.errors import DomainError
from app.modules.solo_activity import attempt_machine as sm
from app.modules.solo_activity.repositories import SoloAttempt, SoloMessage
from tests.course_management.conftest import switch
from tests.solo_activity.test_solo_attempts_api import (
    MET,
    NOT_MET,
    SCENARIO,
    answer,
    confirm,
    do,
    join,
    ok,
    setup,
    start,
)
from tests.solo_activity.test_solo_conclude import confirm_current
from tests.solo_activity.test_solo_state_table import fresh

EXTENSION = {
    "scenario": "一輛失控的電車正駛向五名工人。你站在拉桿旁：拉下它，電車會轉向另一條軌道，那裡有你的朋友。",
    "change": {"condition": "另一條軌道上的人", "before": "一名陌生工人", "after": "你的朋友"},
    "sources": [{"message_ref": "m1", "quote": "不能主動害人"}],
}


def extension_calls(calls):
    """The provider calls that wrote a scenario: they alone carry earlier_scenarios."""
    contexts = (json.loads(call["messages"][1]["content"]) for call in calls)
    return [context for context in contexts if "earlier_scenarios" in context]


def to_confirmed_view(client, replies, extension, *, text="不能主動害人"):
    """The first scenario answered, talked through and confirmed; ``extension`` is the next reply."""
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(NOT_MET)
    answer(client, attempt["id"], text)
    replies.append(MET)
    view = ok(do(client, attempt["id"], "send_message", {"text": "因為是我親手造成的"}))
    assert view["state"] == "confirming"
    replies.extend(extension if isinstance(extension, list) else [extension])
    return s, attempt["id"], confirm(client, attempt["id"], view)


# ---- the machine ---------------------------------------------------------------------------


def test_after_the_only_scenario_the_rule_still_wants_more():
    a = confirm_current(fresh(1))
    assert a.state == "reviewing"
    assert sm.wants_extension(a)


def test_a_next_scenario_that_exists_needs_no_extension():
    a = confirm_current(fresh(2))
    assert a.state == "between_scenarios"
    assert not sm.wants_extension(a)


def test_once_the_rule_concludes_nothing_more_is_written():
    a = confirm_current(sm.next_scenario(confirm_current(fresh(2))))
    assert a.state == "reviewing"
    assert not sm.wants_extension(a)


def test_a_shift_in_the_latest_scenario_asks_for_one_more():
    a = sm.next_scenario(confirm_current(fresh(2)))
    a = confirm_current(a, shifted=True)
    assert a.state == "reviewing" and sm.wants_extension(a)


def test_an_extension_is_appended_after_the_last_scenario_and_kept_with_its_basis():
    a = confirm_current(fresh(1))
    change = {"condition": "那名工人", "before": "陌生人", "after": "你的朋友"}
    sources = [{"message_id": "m-1", "quote": "不能主動害人", "start": 0, "end": 6}]
    made_by = {"provider": "openrouter", "model": "tutor-model"}
    a = sm.extend(a, "s2", "新的情境", change, sources, made_by)

    assert a.state == "between_scenarios"
    assert a.scenario_count == 2 and a.scenario_index == 0
    added = a.progress[1]
    assert (added.scenario_id, added.text, added.change) == ("s2", "新的情境", change)
    assert (added.sources, added.generated_by) == (sources, made_by)
    # Moving on shows it as the next scenario, from nothing.
    a = sm.next_scenario(a)
    assert (a.state, a.scenario_index, a.current.text) == ("answering", 1, "新的情境")


@pytest.mark.parametrize("build", [lambda: fresh(1), lambda: confirm_current(fresh(2))])
def test_extending_when_none_is_wanted_is_refused(build):
    with pytest.raises(DomainError) as error:
        sm.extend(build(), "s2", "新的情境", {}, [], {})
    assert (error.value.code, error.value.status) == ("SOLO_ACTION_UNAVAILABLE", 409)


# ---- over HTTP -----------------------------------------------------------------------------


def test_confirming_writes_the_next_scenario_from_this_students_own_words(client, tutor):
    calls, replies = tutor
    _, attempt_id, view = to_confirmed_view(client, replies, EXTENSION)

    assert view["state"] == "between_scenarios"
    assert view["available_actions"] == ["next_scenario"]
    # Scenarios not yet reached never leave the server.
    assert [x["index"] for x in view["scenarios"]] == [0]

    (context,) = extension_calls(calls)
    assert context["scenario"] == SCENARIO
    assert context["earlier_scenarios"] == []
    assert context["confirmed"]["current_position"] == MET["summary"]["current_position"]
    assert [m["text"] for m in context["student_messages"]] == [
        "不能主動害人",
        "因為是我親手造成的",
    ]
    assert [m["ref"] for m in context["student_messages"]] == ["m1", "m2"]
    assert context["output_locale"]

    moved = ok(do(client, attempt_id, "next_scenario"))
    assert moved["state"] == "answering"
    second = moved["scenarios"][1]
    assert second["text"] == EXTENSION["scenario"]
    assert second["change"] == EXTENSION["change"]
    assert moved["scenarios"][0]["change"] is None


def test_the_scenario_is_stored_once_and_survives_refreshing_and_moving_on(client, tutor):
    calls, replies = tutor
    _, attempt_id, _ = to_confirmed_view(client, replies, EXTENSION)
    replies.append({**EXTENSION, "scenario": "另一個情境，不應該出現。"})

    again = ok(client.get(f"/api/v2/solo/attempts/{attempt_id}"))
    assert again["state"] == "between_scenarios"
    moved = ok(do(client, attempt_id, "next_scenario"))
    assert moved["scenarios"][1]["text"] == EXTENSION["scenario"]
    assert len(extension_calls(calls)) == 1


def test_what_the_scenario_rests_on_is_stored(client, tutor):
    _, replies = tutor
    _, attempt_id, _ = to_confirmed_view(client, replies, EXTENSION)
    with storage.transaction() as db:
        row = db.get(SoloAttempt, attempt_id)
        added = row.progress[1]
        first_message = db.scalars(
            select(SoloMessage)
            .where(SoloMessage.attempt_id == attempt_id, SoloMessage.role == "student")
            .order_by(SoloMessage.seq)
        ).first()
        first_message_id = first_message.id
    assert added["change"] == EXTENSION["change"]
    assert added["sources"] == [
        {"message_id": first_message_id, "quote": "不能主動害人", "start": 0, "end": 6}
    ]
    assert added["generated_by"]["model"] == "tutor-model"


def test_two_students_who_answer_differently_are_not_given_each_others_words(client, tutor):
    calls, replies = tutor
    s, _, _ = to_confirmed_view(client, replies, EXTENSION)

    other = join(client, s["course"], "student2")
    switch(client, other)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(NOT_MET)
    answer(client, attempt["id"], "我會拉桿，五條命比一條多")
    replies.append(MET)
    view = ok(do(client, attempt["id"], "send_message", {"text": "數字比較重要"}))
    replies.append({**EXTENSION, "sources": [{"message_ref": "m1", "quote": "五條命比一條多"}]})
    confirm(client, attempt["id"], view)

    first, second = extension_calls(calls)
    assert [m["text"] for m in second["student_messages"]] == [
        "我會拉桿，五條命比一條多",
        "數字比較重要",
    ]
    assert "不能主動害人" not in json.dumps(second, ensure_ascii=False)
    assert "五條命比一條多" not in json.dumps(first, ensure_ascii=False)


def test_a_failed_call_leaves_the_student_in_the_review(client, tutor):
    _, replies = tutor
    _, attempt_id, view = to_confirmed_view(client, replies, RuntimeError("provider down"))
    assert view["state"] == "reviewing"
    assert view["available_actions"] == ["retry_reflection_prompt", "submit_review"]
    assert len(view["scenarios"]) == 1
    # The review was never taken away: nothing is left half-made.
    assert ok(client.get(f"/api/v2/solo/attempts/{attempt_id}"))["state"] == "reviewing"


def test_quotes_that_are_not_the_students_words_write_no_scenario(client, tutor):
    calls, replies = tutor
    bad = {**EXTENSION, "sources": [{"message_ref": "m1", "quote": "學生從沒說過這句話"}]}
    _, attempt_id, view = to_confirmed_view(client, replies, [bad, bad])
    # Regenerated once, still ungrounded: no scenario is written and the student reviews.
    assert len(extension_calls(calls)) == 2
    assert view["state"] == "reviewing"
    assert len(ok(client.get(f"/api/v2/solo/attempts/{attempt_id}"))["scenarios"]) == 1


def test_a_settled_view_at_the_floor_writes_nothing_more(client, tutor):
    calls, replies = tutor
    _, attempt_id, _ = to_confirmed_view(client, replies, EXTENSION)
    ok(do(client, attempt_id, "next_scenario"))
    replies.append(NOT_MET)
    answer(client, attempt_id, "朋友也一樣，我不會主動害人")
    replies.append(MET)
    view = ok(do(client, attempt_id, "send_message", {"text": "還是親手造成的差別"}))
    view = confirm(client, attempt_id, view)
    assert view["state"] == "reviewing"
    assert len(extension_calls(calls)) == 1
