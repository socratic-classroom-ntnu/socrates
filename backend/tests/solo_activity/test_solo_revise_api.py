"""/api/v2/solo after 不太對: structured hints, changing one's mind, and what the tutor returns.

revise_hint tells the tutor which part of the summary was wrong and is kept for statistics;
changed_mind moves the current option while option_id stays the initial one, so T6 can count
changed stances as initial != final.
"""

import json

from sqlalchemy import select

from app.modules.platform.repositories import classroom_storage as storage
from app.modules.solo_dialogue.repositories.solo_models import SoloAttempt, SoloMessage
from tests.solo_activity.test_solo_attempts_api import (
    MET,
    NOT_MET,
    confirm,
    do,
    ok,
    setup,
    stance,
    start,
    to_confirming,
)


def revising(client, replies):
    """An attempt on o1 (不拉) whose first summary the student has just turned down."""
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    to_confirming(client, attempt["id"], replies)
    view = ok(do(client, attempt["id"], "revise_viewpoint"))
    assert view["revising"] is True
    return attempt["id"]


def context(call) -> dict:
    return json.loads(call["messages"][1]["content"])


def test_changed_mind_updates_current_option(client, tutor):
    _, replies = tutor
    attempt_id = revising(client, replies)

    replies.append(NOT_MET)
    body = {"text": "想一想我還是會拉", "revise_hint": "changed_mind", "new_option_id": "o0"}
    view = ok(do(client, attempt_id, "send_message", body))
    assert view["questions"][0]["stance"] == {
        "option_id": "o1",
        "current_option_id": "o0",
        "reason": "不能主動害人",
    }

    replies.append(MET)
    view = ok(do(client, attempt_id, "send_message", {"text": "救五個人比較重要"}))
    assert view["state"] == "confirming"
    confirm(client, attempt_id, view)
    activity = ok(client.get(f"/api/v2/solo/activities/{view['activity_id']}"))
    assert activity["attempt"]["progress"][0]["option_label"] == "拉"
    with storage.transaction() as db:
        progress = db.get(SoloAttempt, attempt_id).progress[0]
    assert (progress["option_id"], progress["final_option_id"]) == ("o1", "o0")


def test_revise_hint_only_while_revising(client, tutor):
    _, replies = tutor
    attempt_id = revising(client, replies)
    replies.append(NOT_MET)
    ok(do(client, attempt_id, "send_message", {"text": "我是說工人不知情的時候"}))

    # No longer revising: a hint is refused.
    body = {"text": "再說一次", "revise_hint": "reason"}
    response = do(client, attempt_id, "send_message", body)
    assert (response.status_code, response.json()) == (422, {"detail": "SOLO_OPTION_INVALID"})

    replies.append(MET)
    view = ok(do(client, attempt_id, "send_message", {"text": "就是這樣"}))
    assert view["state"] == "confirming"
    ok(do(client, attempt_id, "revise_viewpoint"))
    for body in (
        {"text": "我改變想法了", "revise_hint": "changed_mind"},  # no new option
        {"text": "我改變想法了", "revise_hint": "changed_mind", "new_option_id": "o9"},
        {"text": "我改變想法了", "revise_hint": "changed_mind", "new_option_id": "o1"},  # same
        {"text": "理由不太對", "revise_hint": "reason", "new_option_id": "o0"},
        {"text": "沒有提示卻換立場", "new_option_id": "o0"},
    ):
        response = do(client, attempt_id, "send_message", body)
        assert (response.status_code, response.json()) == (
            422,
            {"detail": "SOLO_OPTION_INVALID"},
        ), body
    response = do(client, attempt_id, "send_message", {"text": "x", "revise_hint": "mood"})
    assert response.status_code == 422
    # Refused requests saved nothing: still revising.
    view = ok(client.get(f"/api/v2/solo/attempts/{attempt_id}"))
    assert view["revising"] is True and view["state"] == "in_dialogue"


def test_revise_hint_reaches_prompt_context(client, tutor):
    calls, replies = tutor
    attempt_id = revising(client, replies)
    assert "revise_hint" not in context(calls[-1])
    assert "stance_changed_from" not in context(calls[-1])

    replies.append(NOT_MET)
    ok(do(client, attempt_id, "send_message", {"text": "條件不對", "revise_hint": "condition"}))
    sent = context(calls[-1])
    assert sent["revise_hint"] == "condition"
    assert "stance_changed_from" not in sent

    replies.append(NOT_MET)
    ok(do(client, attempt_id, "send_message", {"text": "沒什麼要補充"}))
    assert "revise_hint" not in context(calls[-1])

    replies.append(MET)
    ok(do(client, attempt_id, "send_message", {"text": "就是這樣"}))
    ok(do(client, attempt_id, "revise_viewpoint"))
    replies.append(NOT_MET)
    body = {"text": "我會拉", "revise_hint": "changed_mind", "new_option_id": "o0"}
    ok(do(client, attempt_id, "send_message", body))
    sent = context(calls[-1])
    assert sent["revise_hint"] == "changed_mind"
    assert (sent["option_id"], sent["option_text"]) == ("o0", "拉")
    assert sent["stance_changed_from"] == "不拉"


def test_message_meta_persisted(client, tutor):
    _, replies = tutor
    attempt_id = revising(client, replies)
    replies.append(NOT_MET)
    body = {"text": "我會拉", "revise_hint": "changed_mind", "new_option_id": "o0"}
    view = ok(do(client, attempt_id, "send_message", body))

    with storage.transaction() as db:
        metas = [
            (m.role, m.meta)
            for m in db.scalars(
                select(SoloMessage)
                .where(SoloMessage.attempt_id == attempt_id)
                .order_by(SoloMessage.seq)
            )
        ]
    assert ("student", {"revise_hint": "changed_mind", "new_option_id": "o0"}) in metas
    assert metas[0] == ("student", None)  # the stance's reason carries no hint
    students = [m for m in view["messages"] if m["role"] == "student"]
    assert [m["revise_hint"] for m in students] == [None, None, "changed_mind"]
    assert all(m["move"] is None for m in students)


def test_tutor_move_and_principle_note_in_view(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.append({**NOT_MET, "move": "hypothetical"})
    view = stance(client, attempt["id"])
    tutor_messages = [m for m in view["messages"] if m["role"] == "tutor"]
    assert [m["move"] for m in tutor_messages] == ["hypothetical"]
    assert tutor_messages[0]["revise_hint"] is None

    note = "你看重的是行為本身能不能做，這接近義務論，例如康德。"
    replies.append({**MET, "summary": {**MET["summary"], "principle_note": note}})
    view = ok(do(client, attempt["id"], "send_message", {"text": "因為是我親手造成的"}))
    assert view["state"] == "confirming"
    assert view["candidate_summary"]["principle_note"] == note
    assert [m["move"] for m in view["messages"] if m["role"] == "tutor"] == [
        "hypothetical",
        "probe",
    ]
    view = confirm(client, attempt["id"], view)
    assert view["questions"][0]["confirmed_summary"]["principle_note"] == note


def test_summary_without_principle_note_reads_as_empty(client, tutor):
    """Summaries stored before principle_note existed (the rehearsed demo data) still load."""
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    to_confirming(client, attempt["id"], replies)
    with storage.transaction() as db:
        row = db.get(SoloAttempt, attempt["id"])
        progress = [dict(entry) for entry in row.progress]
        progress[0]["candidate_summary"].pop("principle_note", None)
        progress[0].pop("current_option_id", None)
        row.progress = progress
    view = ok(client.get(f"/api/v2/solo/attempts/{attempt['id']}"))
    assert view["candidate_summary"]["principle_note"] == ""
    assert view["questions"][0]["stance"]["current_option_id"] == "o1"


def test_revise_requires_one_more_turn(client, tutor):
    _, replies = tutor
    attempt_id = revising(client, replies)

    replies.append(MET)
    view = ok(
        do(client, attempt_id, "send_message", {"text": "理由不太對。", "revise_hint": "reason"})
    )
    assert view["state"] == "in_dialogue"
    assert view["candidate_summary"] is None

    replies.append(MET)
    view = ok(do(client, attempt_id, "send_message", {"text": "我是說親手造成的那種"}))
    assert view["state"] == "confirming"
