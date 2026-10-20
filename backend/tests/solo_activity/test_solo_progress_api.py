"""T5 live progress: owner-only, status and turn counts only, never what anyone wrote."""

import json
import time

import pytest
from sqlalchemy import select

from app.modules.platform.repositories import classroom_storage as storage
from app.modules.solo_dialogue.repositories.solo_models import SoloAttempt, SoloMessage
from app.modules.solo_dialogue.services import solo_progress
from tests.course_management.conftest import switch, user
from tests.course_management.test_activities_api import create_activity
from tests.course_management.test_courses_api import create_course
from tests.solo_activity.test_solo_attempts_api import (
    MET,
    OPENING,
    confirm,
    join,
    ok,
    setup,
    stance,
    start,
    to_confirming,
    two_questions,
)


def progress(client, activity_id):
    return client.get(f"/api/v2/solo/activities/{activity_id}/progress")


def set_attempt(attempt_id, state, question_index, turn=0, updated_at=None):
    """Put an attempt straight into a state; the state machine has its own tests."""
    with storage.transaction() as db:
        row = db.get(SoloAttempt, attempt_id)
        row.state = state
        row.question_index = question_index
        entries = [dict(entry) for entry in row.progress]
        entries[question_index]["turn_index"] = turn
        row.progress = entries
        if updated_at is not None:
            row.updated_at = updated_at


def student_row(view, display_name):
    return next(s for s in view["students"] if s["display_name"] == display_name)


def test_only_course_owner_can_read(client, tutor):
    s = setup(client, questions=two_questions())
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
    s = setup(client, questions=two_questions())
    attempt = ok(start(client, s["activity_id"]))
    confirm(client, attempt["id"], to_confirming(client, attempt["id"], replies))
    ok(client.post(f"/api/v2/solo/attempts/{attempt['id']}/next_question"))
    replies.append(OPENING)
    stance(client, attempt["id"], option_id="o0", reason="五個人比一個人多")

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
        "reason",
        "stance",
        "candidate_summary",
        "confirmed_summary",
        "principle_note",
        "option_label",
    }
    assert leaked == set()


CELL_CASES = [
    ("choosing_stance", 0, 0, [("choosing_stance", None), ("not_started", None)], "in_progress"),
    ("awaiting_tutor", 0, 2, [("in_dialogue", 2), ("not_started", None)], "in_progress"),
    ("tutor_unavailable", 0, 1, [("in_dialogue", 1), ("not_started", None)], "in_progress"),
    ("in_dialogue", 0, 3, [("in_dialogue", 3), ("not_started", None)], "in_progress"),
    ("confirming", 0, 2, [("confirming", None), ("not_started", None)], "in_progress"),
    ("between_questions", 0, 2, [("confirmed", None), ("not_started", None)], "in_progress"),
    ("choosing_stance", 1, 0, [("confirmed", None), ("choosing_stance", None)], "in_progress"),
    ("in_dialogue", 1, 4, [("confirmed", None), ("in_dialogue", 4)], "in_progress"),
    ("confirming", 1, 2, [("confirmed", None), ("confirming", None)], "in_progress"),
    ("reviewing", 1, 2, [("confirmed", None), ("confirmed", None)], "done"),
]


@pytest.mark.parametrize(("state", "index", "turn", "cells", "overall"), CELL_CASES)
def test_cells_follow_attempt_state(client, tutor, state, index, turn, cells, overall):
    s = setup(client, questions=two_questions())
    attempt = ok(start(client, s["activity_id"]))
    set_attempt(attempt["id"], state, index, turn=turn)

    switch(client, s["teacher"])
    row = ok(progress(client, s["activity_id"]))["students"][0]
    assert [(c["status"], c["turns"]) for c in row["cells"]] == cells
    assert row["overall"] == overall
    assert row["review_status"] == ("in_progress" if state == "reviewing" else "not_started")


def test_summary_counts(client, tutor):
    s = setup(client, questions=two_questions())
    dialogue = ok(start(client, s["activity_id"]))
    join(client, s["course"], "between")
    between_attempt = ok(start(client, s["activity_id"]))
    join(client, s["course"], "review")
    review_attempt = ok(start(client, s["activity_id"]))
    join(client, s["course"], "idle")
    set_attempt(dialogue["id"], "in_dialogue", 0, turn=2)
    set_attempt(between_attempt["id"], "between_questions", 0)
    set_attempt(review_attempt["id"], "reviewing", 1)

    switch(client, s["teacher"])
    view = ok(progress(client, s["activity_id"]))
    assert view["summary"] == {
        "enrolled": 4,
        "started": 3,
        "done": 1,
        # q1: only the one still talking; q2: everyone started but not past it, review excepted.
        "unconfirmed_by_question": [1, 2],
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
    s = setup(client, questions=two_questions())
    attempt = ok(start(client, s["activity_id"]))
    replies.append(OPENING)
    stance(client, attempt["id"])
    join(client, s["course"], "review")
    review_attempt = ok(start(client, s["activity_id"]))
    set_attempt(review_attempt["id"], "reviewing", 1, updated_at=time.time() - 3600)
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
    s = setup(client, questions=two_questions())

    switch(client, s["teacher"])
    view = ok(progress(client, s["activity_id"]))
    assert view["activity_id"] == s["activity_id"]
    assert view["course_id"] == s["course"]["id"]
    assert view["course_name"] == s["course"]["name"]
    assert view["status"] == "open"
    assert view["question_count"] == 2
    assert view["questions"] == [
        {"index": 0, "title": "岔道上的選擇"},
        {"index": 1, "title": "天橋上的胖子"},
    ]
    assert view["summary"] == {
        "enrolled": 1,
        "started": 0,
        "done": 0,
        "unconfirmed_by_question": [0, 0],
        "attention": 0,
    }
    (row,) = view["students"]
    assert row["display_name"] == "student同學"
    assert row["enrollment_id"]
    assert row["overall"] == "not_started"
    assert row["cells"] == [
        {"status": "not_started", "turns": None},
        {"status": "not_started", "turns": None},
    ]
    assert row["review_status"] == "not_started"
    assert row["last_activity_at"] is None
    assert row["attention"] is False


def test_draft_activity_reads_as_draft(client):
    user(client, "owner")
    course = create_course(client)
    body = create_activity(client, course["id"], questions=two_questions())

    view = ok(progress(client, body["id"]))
    assert view["status"] == "draft"
    assert [q["title"] for q in view["questions"]] == ["岔道上的選擇", "天橋上的胖子"]
    assert view["students"] == []
