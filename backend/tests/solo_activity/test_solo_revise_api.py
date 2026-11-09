"""/api/v2/solo after 不太對: structured hints, and what the tutor returns.

revise_hint tells the tutor which part of the summary was wrong and is kept for statistics. There
are no options to change: 我其實改變想法了 is a hint like the others, said in the student's words.
"""

import json

from sqlalchemy import select

from app.modules.platform import storage as storage
from app.modules.solo_activity.repositories import SoloAttempt, SoloMessage
from tests.solo_activity.test_solo_attempts_api import (
    MET,
    NOT_MET,
    answer,
    confirm,
    do,
    ok,
    setup,
    start,
    to_confirming,
)


def revising(client, replies):
    """An attempt whose first summary the student has just turned down."""
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    to_confirming(client, attempt["id"], replies)
    view = ok(do(client, attempt["id"], "revise_viewpoint"))
    assert view["revising"] is True
    return attempt["id"]


def context(call) -> dict:
    return json.loads(call["messages"][1]["content"])


def test_changed_mind_is_a_hint_in_the_students_own_words(client, tutor):
    _, replies = tutor
    attempt_id = revising(client, replies)

    replies.append(NOT_MET)
    body = {"text": "想一想我還是會拉", "revise_hint": "changed_mind"}
    view = ok(do(client, attempt_id, "send_message", body))
    assert view["scenarios"][0]["answer"] == "不能主動害人"
    assert [m["revise_hint"] for m in view["messages"] if m["role"] == "student"] == [
        None,
        None,
        "changed_mind",
    ]

    replies.append(MET)
    view = ok(do(client, attempt_id, "send_message", {"text": "救五個人比較重要"}))
    assert view["state"] == "confirming"
    view = confirm(client, attempt_id, view)
    assert view["scenarios"][0]["confirmed_summary"] == MET["summary"]


def test_revise_hint_only_while_revising(client, tutor):
    _, replies = tutor
    attempt_id = revising(client, replies)
    replies.append(NOT_MET)
    ok(do(client, attempt_id, "send_message", {"text": "我是說工人不知情的時候"}))

    # No longer revising: a hint is refused.
    body = {"text": "再說一次", "revise_hint": "reason"}
    response = do(client, attempt_id, "send_message", body)
    assert (response.status_code, response.json()) == (
        422,
        {"detail": "SOLO_REVISE_HINT_INVALID"},
    )

    replies.append(MET)
    view = ok(do(client, attempt_id, "send_message", {"text": "就是這樣"}))
    assert view["state"] == "confirming"
    ok(do(client, attempt_id, "revise_viewpoint"))
    # An option field is not part of the body: refused as a malformed request, nothing saved.
    response = do(client, attempt_id, "send_message", {"text": "我換了", "new_option_id": "o0"})
    assert response.status_code == 422
    response = do(client, attempt_id, "send_message", {"text": "x", "revise_hint": "mood"})
    assert response.status_code == 422
    # Refused requests saved nothing: still revising.
    view = ok(client.get(f"/api/v2/solo/attempts/{attempt_id}"))
    assert view["revising"] is True and view["state"] == "in_dialogue"


def test_revise_hint_reaches_prompt_context(client, tutor):
    calls, replies = tutor
    attempt_id = revising(client, replies)
    assert "revise_hint" not in context(calls[-1])

    replies.append(NOT_MET)
    ok(do(client, attempt_id, "send_message", {"text": "條件不對", "revise_hint": "condition"}))
    assert context(calls[-1])["revise_hint"] == "condition"

    replies.append(NOT_MET)
    ok(do(client, attempt_id, "send_message", {"text": "沒什麼要補充"}))
    assert "revise_hint" not in context(calls[-1])

    replies.append(MET)
    ok(do(client, attempt_id, "send_message", {"text": "就是這樣"}))
    ok(do(client, attempt_id, "revise_viewpoint"))
    replies.append(NOT_MET)
    body = {"text": "我會拉", "revise_hint": "changed_mind"}
    ok(do(client, attempt_id, "send_message", body))
    assert context(calls[-1])["revise_hint"] == "changed_mind"


def test_message_meta_persisted(client, tutor):
    _, replies = tutor
    attempt_id = revising(client, replies)
    replies.append(NOT_MET)
    body = {"text": "我會拉", "revise_hint": "changed_mind"}
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
    assert ("student", {"revise_hint": "changed_mind"}) in metas
    assert metas[0] == ("student", None)  # the first answer carries no hint
    students = [m for m in view["messages"] if m["role"] == "student"]
    assert [m["revise_hint"] for m in students] == [None, None, "changed_mind"]
    assert all(m["move"] is None for m in students)


def test_tutor_move_and_principle_note_in_view(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.append({**NOT_MET, "move": "hypothetical"})
    view = answer(client, attempt["id"])
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
    assert view["scenarios"][0]["confirmed_summary"]["principle_note"] == note


def test_summary_without_principle_note_reads_as_empty(client, tutor):
    """Summaries stored before principle_note existed still load."""
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    to_confirming(client, attempt["id"], replies)
    with storage.transaction() as db:
        row = db.get(SoloAttempt, attempt["id"])
        progress = [dict(entry) for entry in row.progress]
        progress[0]["candidate_summary"].pop("principle_note", None)
        row.progress = progress
    view = ok(client.get(f"/api/v2/solo/attempts/{attempt['id']}"))
    assert view["candidate_summary"]["principle_note"] == ""


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
