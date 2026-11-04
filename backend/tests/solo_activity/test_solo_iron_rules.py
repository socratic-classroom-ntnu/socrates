"""The solo tutor's reply goes through the iron rules (AGENTS.md): a reply that leaks the prompt is
generated once more, and a second leak is replaced by the tutor's pull-back sentence."""

import json

from sqlalchemy import select

from app.modules.llm_runtime import iron_rules
from app.modules.llm_runtime.prompts import ROOT
from app.modules.platform import storage
from app.modules.solo_activity.repositories import SoloMessage
from tests.solo_activity.test_solo_attempts_api import MET, OPENING, do, ok, setup, stance, start


def template_text() -> str:
    programs = json.loads((ROOT / "prompts/classroom/programs.json").read_text())["programs"]
    return programs["solo_tutor"]["template"][:40]


def leaking() -> dict:
    return {**OPENING, "reply_text": template_text() + "？"}


def last_tutor_text(view: dict) -> str:
    return [m["text"] for m in view["messages"] if m["role"] == "tutor"][-1]


def test_a_leaking_reply_is_generated_once_more(client, tutor):
    calls, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.extend([leaking(), OPENING])

    view = stance(client, attempt["id"])

    assert len(calls) == 2
    assert last_tutor_text(view) == OPENING["reply_text"]


def test_a_reply_that_leaks_twice_becomes_the_pull_back_sentence(client, tutor):
    calls, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.extend([leaking(), leaking()])

    view = stance(client, attempt["id"])

    assert len(calls) == 2
    assert last_tutor_text(view) == iron_rules.fallback_text("solo_tutor")
    assert view["state"] == "in_dialogue"


def test_a_summary_that_leaks_twice_never_reaches_the_student(client, tutor):
    """The rejected reply reports the goal met; its summary must not become the confirm card."""
    calls, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(OPENING)
    stance(client, attempt["id"])
    leaked = {**MET, "summary": {**MET["summary"], "reason_summary": template_text()}}
    replies.extend([leaked, leaked])

    view = ok(do(client, attempt["id"], "send_message", {"text": "因為是我親手造成的"}))

    assert len(calls) == 3
    assert view["state"] == "in_dialogue"
    assert view["candidate_summary"] is None
    assert last_tutor_text(view) == iron_rules.fallback_text("solo_tutor")
    assert template_text() not in json.dumps(view, ensure_ascii=False)
    with storage.transaction() as db:
        stored = db.scalars(
            select(SoloMessage).where(SoloMessage.role == "tutor").order_by(SoloMessage.seq)
        ).all()[-1]
        # Nothing from the rejected reply is kept with the pull-back sentence.
        assert (stored.observations, stored.meta) == (None, None)
