"""設計規格 §10：學生打了一大段思考，結果模型超時、整段消失——這是這個產品最不能發生的事。

順序必須是：存學生訊息 → commit → 呼叫 provider（solo_activity/service.py 的 Tx1 → provider → Tx2）。
"""

import json

from sqlalchemy import select

from app.modules.ai_providers.service import ProviderWait
from app.modules.platform import storage
from app.modules.solo_activity.repositories import SoloMessage
from tests.solo_activity.test_solo_attempts_api import (
    NOT_MET,
    OPENING,
    do,
    ok,
    setup,
    stance,
    start,
)

LONG_THOUGHT = "我想了很久才寫出這一段：主動造成傷害和任其發生，對我來說不一樣。"


def committed_texts() -> list[str]:
    """Read on another connection: only committed rows are visible."""
    with storage.transaction() as db:
        return list(db.scalars(select(SoloMessage.text).order_by(SoloMessage.seq)))


def in_dialogue(client, tutor) -> str:
    _, replies = tutor
    attempt = ok(start(client, setup(client)["activity_id"]))
    replies.append(OPENING)
    stance(client, attempt["id"])
    return attempt["id"]


def test_student_message_is_committed_before_the_provider_is_called(client, tutor):
    _, replies = tutor
    attempt_id = in_dialogue(client, tutor)
    seen_at_call: list[list[str]] = []

    def fail_after_looking():
        seen_at_call.append(committed_texts())
        raise ProviderWait("PROVIDER_TIMEOUT", 60)

    replies.append(fail_after_looking)
    view = ok(do(client, attempt_id, "send_message", {"text": LONG_THOUGHT}))

    assert seen_at_call and LONG_THOUGHT in seen_at_call[0]
    assert view["state"] == "tutor_unavailable"
    assert view["available_actions"] == ["retry"]
    assert LONG_THOUGHT in [m["text"] for m in view["messages"] if m["role"] == "student"]
    # Reloading still shows it: the failure did not roll the message back.
    reloaded = ok(client.get(f"/api/v2/solo/attempts/{attempt_id}"))
    assert LONG_THOUGHT in [m["text"] for m in reloaded["messages"]]


def test_a_provider_exception_keeps_the_message_too(client, tutor):
    _, replies = tutor
    attempt_id = in_dialogue(client, tutor)
    replies.append(RuntimeError("provider 連線中斷"))

    view = ok(do(client, attempt_id, "send_message", {"text": LONG_THOUGHT}))

    assert view["state"] == "tutor_unavailable"
    assert LONG_THOUGHT in committed_texts()


def test_retry_resumes_without_retyping(client, tutor):
    calls, replies = tutor
    attempt_id = in_dialogue(client, tutor)
    replies.append(ProviderWait("PROVIDER_TIMEOUT", 60))
    ok(do(client, attempt_id, "send_message", {"text": LONG_THOUGHT}))

    replies.append(NOT_MET)
    view = ok(do(client, attempt_id, "retry"))

    assert view["state"] == "in_dialogue"
    assert view["messages"][-1]["role"] == "tutor"
    # The retried call carries the stored message; the student typed it only once.
    context = json.loads(calls[-1]["messages"][1]["content"])
    assert context["history"][-1] == {"role": "student", "text": LONG_THOUGHT}
    assert [m["text"] for m in view["messages"]].count(LONG_THOUGHT) == 1
    again = do(client, attempt_id, "retry")
    assert (again.status_code, again.json()) == (409, {"detail": "SOLO_ACTION_UNAVAILABLE"})


def test_retry_without_a_failed_call_is_rejected(client, tutor):
    attempt_id = in_dialogue(client, tutor)
    response = do(client, attempt_id, "retry")
    assert (response.status_code, response.json()) == (409, {"detail": "SOLO_ACTION_UNAVAILABLE"})


def test_a_second_message_cannot_skip_the_pending_reply(client, tutor):
    _, replies = tutor
    attempt_id = in_dialogue(client, tutor)
    replies.append(ProviderWait("PROVIDER_TIMEOUT", 60))
    ok(do(client, attempt_id, "send_message", {"text": "先前的發言"}))

    response = do(client, attempt_id, "send_message", {"text": "新發言"})

    assert (response.status_code, response.json()) == (409, {"detail": "SOLO_ACTION_UNAVAILABLE"})
    assert "新發言" not in committed_texts()


def test_the_provider_receives_the_latest_persisted_student_message(client, tutor):
    calls, replies = tutor
    attempt_id = in_dialogue(client, tutor)
    replies.append(NOT_MET)

    ok(do(client, attempt_id, "send_message", {"text": "我最新的發言"}))

    context = json.loads(calls[-1]["messages"][1]["content"])
    assert context["history"][-1] == {"role": "student", "text": "我最新的發言"}
