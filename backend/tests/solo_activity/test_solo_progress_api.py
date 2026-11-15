"""T5 live progress: owner-only, status and turn counts only, never what anyone wrote."""

import json
import time

import pytest
from sqlalchemy import select

from app.modules.platform import storage as storage
from app.modules.solo_activity.repositories import SoloAttempt, SoloMessage
from app.modules.solo_activity import progress as solo_progress
from tests.course_management.conftest import switch, user
from tests.course_management.test_activities_api import create_activity
from tests.course_management.test_courses_api import create_course
from tests.solo_activity.test_solo_attempts_api import (
    MET,
    OPENING,
    SECOND,
    add_scenario,
    answer,
    confirm,
    join,
    ok,
    setup,
    start,
    to_confirming,
)


def progress(client, activity_id):
    return client.get(f"/api/v2/solo/activities/{activity_id}/progress")


def start_with_two_scenarios(client, activity_id):
    attempt = ok(start(client, activity_id))
    add_scenario(attempt["id"], SECOND)
    return attempt


def set_attempt(attempt_id, state, scenario_index, turn=0, updated_at=None):
    """Put an attempt straight into a state; the state machine has its own tests."""
    with storage.transaction() as db:
        row = db.get(SoloAttempt, attempt_id)
        row.state = state
        row.scenario_index = scenario_index
        entries = [dict(entry) for entry in row.progress]
        entries[scenario_index]["turn_index"] = turn
        row.progress = entries
        if updated_at is not None:
            row.updated_at = updated_at


def student_row(view, display_name):
    return next(s for s in view["students"] if s["display_name"] == display_name)


def test_only_course_owner_can_read(client, tutor):
    s = setup(client)
    ok(start(client, s["activity_id"]))
    response = progress(client, s["activity_id"])
    assert (response.status_code, response.json()) == (404, {"detail": "ACTIVITY_NOT_FOUND"})

    user(client, "other")
    create_course(client)
    response = progress(client, s["activity_id"])
    assert (response.status_code, response.json()) == (404, {"detail": "ACTIVITY_NOT_FOUND"})

    user(client, "outsider")
    response = progress(client, s["activity_id"])
    assert (response.status_code, response.json()) == (404, {"detail": "ACTIVITY_NOT_FOUND"})

    switch(client, s["teacher"])
    assert progress(client, s["activity_id"]).status_code == 200
    response = progress(client, "missing")
    assert (response.status_code, response.json()) == (404, {"detail": "ACTIVITY_NOT_FOUND"})


def test_no_message_text_or_summary_leaks(client, tutor):
    _, replies = tutor
    s = setup(client)
    attempt = start_with_two_scenarios(client, s["activity_id"])
    confirm(client, attempt["id"], to_confirming(client, attempt["id"], replies))
    ok(client.post(f"/api/v2/solo/attempts/{attempt['id']}/next_scenario"))
    replies.append(OPENING)
    answer(client, attempt["id"], "五個人比一個人多")

    switch(client, s["teacher"])
    body = ok(progress(client, s["activity_id"]))
    raw = json.dumps(body, ensure_ascii=False)
    with storage.transaction() as db:
        texts = list(db.scalars(select(SoloMessage.text)))
    assert len(texts) == 6
    written = texts + [v for v in MET["summary"].values() if isinstance(v, str) and v]
    written += MET["summary"]["relevant_conditions"]
    for text in written:
        assert text not in raw, text

    def keys(value):
        if isinstance(value, dict):
            for key, inner in value.items():
                yield key
                yield from keys(inner)
        elif isinstance(value, list):
            for inner in value:
                yield from keys(inner)

    leaked = set(keys(body)) & {
        "text",
        "messages",
        "observations",
        "answer",
        "candidate_summary",
        "confirmed_summary",
        "principle_note",
    }
    assert leaked == set()


CELL_CASES = [
    ("answering", 0, 0, [("answering", None)], "in_progress"),
    ("awaiting_tutor", 0, 2, [("in_dialogue", 2)], "in_progress"),
    ("tutor_unavailable", 0, 1, [("in_dialogue", 1)], "in_progress"),
    ("in_dialogue", 0, 3, [("in_dialogue", 3)], "in_progress"),
    ("confirming", 0, 2, [("confirming", None)], "in_progress"),
    ("between_scenarios", 0, 2, [("confirmed", None)], "in_progress"),
    ("answering", 1, 0, [("confirmed", None), ("answering", None)], "in_progress"),
    ("in_dialogue", 1, 4, [("confirmed", None), ("in_dialogue", 4)], "in_progress"),
    ("confirming", 1, 2, [("confirmed", None), ("confirming", None)], "in_progress"),
    # The review has begun but the attempt is not completed: still in progress (O6).
    ("reviewing", 1, 2, [("confirmed", None), ("confirmed", None)], "in_progress"),
    ("reflecting", 1, 2, [("confirmed", None), ("confirmed", None)], "in_progress"),
    ("completed", 1, 2, [("confirmed", None), ("confirmed", None)], "done"),
]


@pytest.mark.parametrize(("state", "index", "turn", "cells", "overall"), CELL_CASES)
def test_cells_follow_attempt_state(client, tutor, state, index, turn, cells, overall):
    s = setup(client)
    attempt = start_with_two_scenarios(client, s["activity_id"])
    set_attempt(attempt["id"], state, index, turn=turn)

    switch(client, s["teacher"])
    row = ok(progress(client, s["activity_id"]))["students"][0]
    assert [(c["status"], c["turns"]) for c in row["cells"]] == cells
    assert row["overall"] == overall
    expected = {"reviewing": "in_progress", "reflecting": "in_progress", "completed": "completed"}
    assert row["review_status"] == expected.get(state, "not_started")


def test_summary_counts(client, tutor):
    s = setup(client)
    dialogue = start_with_two_scenarios(client, s["activity_id"])
    join(client, s["course"], "between")
    between_attempt = start_with_two_scenarios(client, s["activity_id"])
    join(client, s["course"], "review")
    review_attempt = start_with_two_scenarios(client, s["activity_id"])
    join(client, s["course"], "idle")
    set_attempt(dialogue["id"], "in_dialogue", 0, turn=2)
    set_attempt(between_attempt["id"], "between_scenarios", 0)
    set_attempt(review_attempt["id"], "completed", 1)

    switch(client, s["teacher"])
    view = ok(progress(client, s["activity_id"]))
    assert view["summary"] == {
        "enrolled": 4,
        "started": 3,
        "done": 1,
        "attention": 0,
    }
    assert [s["display_name"] for s in view["students"]] == [
        "student同學",
        "between同學",
        "review同學",
        "idle同學",
    ]
    assert [s["overall"] for s in view["students"]] == [
        "in_progress",
        "in_progress",
        "done",
        "not_started",
    ]


def test_attention_after_300_seconds(client, tutor, monkeypatch):
    _, replies = tutor
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(OPENING)
    answer(client, attempt["id"])
    join(client, s["course"], "review")
    review_attempt = start_with_two_scenarios(client, s["activity_id"])
    set_attempt(review_attempt["id"], "completed", 1, updated_at=time.time() - 3600)
    with storage.transaction() as db:
        last_message = max(db.scalars(select(SoloMessage.created_at)))
        row = db.get(SoloAttempt, attempt["id"])
        # The attempt row looks stale, but the latest message is recent: the later one counts.
        row.updated_at = last_message - 1000

    switch(client, s["teacher"])
    monkeypatch.setattr(solo_progress, "now", lambda: last_message + 299)
    view = ok(progress(client, s["activity_id"]))
    talking = student_row(view, "student同學")
    assert talking["last_activity_at"] == pytest.approx(last_message)
    assert talking["attention"] is False
    assert view["summary"]["attention"] == 0
    assert view["generated_at"] == pytest.approx(last_message + 299)

    monkeypatch.setattr(solo_progress, "now", lambda: last_message + 301)
    view = ok(progress(client, s["activity_id"]))
    assert student_row(view, "student同學")["attention"] is True
    # Done students are never waiting on anyone, however long ago they acted.
    assert student_row(view, "review同學")["attention"] is False
    assert view["summary"]["attention"] == 1


def test_enrolled_without_attempt_is_not_started(client, tutor):
    s = setup(client)

    switch(client, s["teacher"])
    view = ok(progress(client, s["activity_id"]))
    assert view["activity_id"] == s["activity_id"]
    assert view["course_id"] == s["course"]["id"]
    assert view["course_name"] == s["course"]["name"]
    assert view["status"] == "open"
    assert view["summary"] == {"enrolled": 1, "started": 0, "done": 0, "attention": 0}
    (row,) = view["students"]
    assert row["display_name"] == "student同學"
    assert row["enrollment_id"]
    assert row["overall"] == "not_started"
    assert row["cells"] == []
    assert row["review_status"] == "not_started"
    assert row["last_activity_at"] is None
    assert row["attention"] is False


def test_draft_activity_reads_as_draft(client):
    user(client, "owner")
    course = create_course(client)
    body = create_activity(client, course["id"])

    view = ok(progress(client, body["id"]))
    assert view["status"] == "draft"
    assert view["students"] == []
