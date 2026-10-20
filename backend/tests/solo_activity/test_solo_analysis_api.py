"""T6 statistics: owner-only, confirmed stances and their two summary fields, nothing else."""

import json

from app.modules.course_management.repositories.models import Activity, ActivityRevision
from app.modules.platform.repositories import classroom_storage as storage
from app.modules.solo_dialogue.repositories.solo_models import SoloAttempt, SoloMessage
from tests.course_management.conftest import switch, user
from tests.course_management.test_activities_api import create_activity, question
from tests.course_management.test_courses_api import create_course
from tests.solo_activity.test_solo_attempts_api import join, ok, setup, start, two_questions
from tests.solo_activity.test_solo_progress_api import progress


def analysis(client, activity_id):
    return client.get(f"/api/v2/solo/activities/{activity_id}/analysis")


def summary(reason, conditions=(), **private):
    return {
        "current_position": private.get("current_position", "立場"),
        "reason_summary": reason,
        "relevant_conditions": list(conditions),
        "unresolved_issue": private.get("unresolved_issue", ""),
        "principle_note": private.get("principle_note", ""),
    }


def set_attempt(attempt_id, state, question_index, *entries):
    """Write state and per-question progress straight in; the state machine has its own tests."""
    with storage.transaction() as db:
        row = db.get(SoloAttempt, attempt_id)
        row.state = state
        row.question_index = question_index
        current = [dict(entry) for entry in row.progress]
        for index, fields in enumerate(entries):
            current[index].update(fields)
        row.progress = current


def answered(option_id, final_option_id=None, reason="理由", conditions=()):
    fields = {"option_id": option_id, "current_option_id": option_id}
    if final_option_id is not None:
        fields.update(
            status="confirmed",
            final_option_id=final_option_id,
            current_option_id=final_option_id,
            confirmed_summary=summary(reason, conditions),
        )
    return fields


def student(client, s, name):
    """Another enrolled student with a started attempt (logged in as them)."""
    join(client, s["course"], name)
    return ok(start(client, s["activity_id"]))


def teacher_view(client, s):
    switch(client, s["teacher"])
    return ok(analysis(client, s["activity_id"]))


def test_only_course_owner_can_read(client, tutor):
    s = setup(client, questions=two_questions())
    ok(start(client, s["activity_id"]))
    response = analysis(client, s["activity_id"])
    assert (response.status_code, response.json()) == (404, {"detail": "ACTIVITY_NOT_FOUND"})

    user(client, "other")
    create_course(client)
    response = analysis(client, s["activity_id"])
    assert (response.status_code, response.json()) == (404, {"detail": "ACTIVITY_NOT_FOUND"})

    user(client, "outsider")
    response = analysis(client, s["activity_id"])
    assert (response.status_code, response.json()) == (404, {"detail": "ACTIVITY_NOT_FOUND"})

    switch(client, s["teacher"])
    assert analysis(client, s["activity_id"]).status_code == 200
    response = analysis(client, "missing")
    assert (response.status_code, response.json()) == (404, {"detail": "ACTIVITY_NOT_FOUND"})


def test_deleted_activity_is_not_found(client, tutor):
    s = setup(client, questions=two_questions())
    with storage.transaction() as db:
        db.get(Activity, s["activity_id"]).deleted = True

    switch(client, s["teacher"])
    response = analysis(client, s["activity_id"])
    assert (response.status_code, response.json()) == (404, {"detail": "ACTIVITY_NOT_FOUND"})


def test_no_private_text_leaks(client, tutor):
    s = setup(client, questions=two_questions())
    attempt = ok(start(client, s["activity_id"]))
    secret = {
        "message": "秘密訊息原文甲",
        "tutor": "秘密導師回覆乙",
        "reason": "秘密第一個理由丙",
        "candidate_position": "秘密候選立場丁",
        "candidate_reason": "秘密候選理由戊",
        "candidate_condition": "秘密候選條件己",
        "candidate_issue": "秘密候選疑問庚",
        "candidate_note": "秘密候選原則辛",
        "rejected_position": "秘密否決立場壬",
        "rejected_reason": "秘密否決理由癸",
        "rejected_condition": "秘密否決條件子",
        "rejected_issue": "秘密否決疑問丑",
        "rejected_note": "秘密否決原則寅",
        "confirmed_position": "秘密確認立場卯",
        "confirmed_issue": "秘密確認疑問辰",
        "confirmed_note": "秘密確認原則巳",
        "label": "秘密原則標籤午",
        "observation": "秘密觀察未",
        "meta": "秘密訊息附註申",
    }
    shown = {"reason_summary": "公開確認理由酉", "condition": "公開確認條件戌"}
    set_attempt(
        attempt["id"],
        "reviewing",
        1,
        {
            **answered("o0", "o1"),
            "reason": secret["reason"],
            "principle_label": secret["label"],
            "candidate_summary": {
                "current_position": secret["candidate_position"],
                "reason_summary": secret["candidate_reason"],
                "relevant_conditions": [secret["candidate_condition"]],
                "unresolved_issue": secret["candidate_issue"],
                "principle_note": secret["candidate_note"],
            },
            "rejected_summary": {
                "current_position": secret["rejected_position"],
                "reason_summary": secret["rejected_reason"],
                "relevant_conditions": [secret["rejected_condition"]],
                "unresolved_issue": secret["rejected_issue"],
                "principle_note": secret["rejected_note"],
            },
            "confirmed_summary": summary(
                shown["reason_summary"],
                [shown["condition"]],
                current_position=secret["confirmed_position"],
                unresolved_issue=secret["confirmed_issue"],
                principle_note=secret["confirmed_note"],
            ),
        },
        answered("o0", "o0"),
    )
    with storage.transaction() as db:
        db.add_all(
            [
                SoloMessage(
                    attempt_id=attempt["id"],
                    seq=1,
                    question_index=0,
                    role="student",
                    text=secret["message"],
                    meta={"revise_hint": secret["meta"]},
                ),
                SoloMessage(
                    attempt_id=attempt["id"],
                    seq=2,
                    question_index=0,
                    role="tutor",
                    text=secret["tutor"],
                    observations={"principle_label": secret["observation"]},
                    meta={"move": secret["meta"]},
                ),
            ]
        )

    raw = json.dumps(teacher_view(client, s), ensure_ascii=False)
    for key, text in secret.items():
        assert text not in raw, key
    for text in shown.values():
        assert text in raw


def test_unconfirmed_not_counted_in_any_option(client, tutor):
    s = setup(client, questions=two_questions())
    attempt = ok(start(client, s["activity_id"]))
    set_attempt(attempt["id"], "in_dialogue", 0, answered("o0"))

    first = teacher_view(client, s)["questions"][0]
    assert [(o["count"], o["students"]) for o in first["options"]] == [(0, []), (0, [])]
    assert (first["confirmed"], first["unconfirmed"], first["comparable"]) == (0, 1, 0)
    assert first["changed"] == 0


def test_option_distribution_uses_final_option(client, tutor):
    s = setup(client, questions=two_questions())
    a = ok(start(client, s["activity_id"]))
    b = student(client, s, "second")
    c = student(client, s, "third")
    set_attempt(a["id"], "between_questions", 0, answered("o0", "o0", reason="甲的理由"))
    set_attempt(b["id"], "between_questions", 0, answered("o1", "o1", reason="乙的理由"))
    set_attempt(
        c["id"],
        "between_questions",
        0,
        answered("o1", "o1", reason="丙的理由", conditions=["夜裡"]),
    )

    first = teacher_view(client, s)["questions"][0]
    assert [(o["option_id"], o["text"], o["count"]) for o in first["options"]] == [
        ("o0", "拉", 1),
        ("o1", "不拉", 2),
    ]
    assert first["options"][0]["students"] == [
        {
            "enrollment_id": first["options"][0]["students"][0]["enrollment_id"],
            "display_name": "student同學",
            "changed_from_option_id": None,
            "reason_summary": "甲的理由",
            "relevant_conditions": [],
        }
    ]
    assert [
        (x["display_name"], x["reason_summary"], x["relevant_conditions"])
        for x in first["options"][1]["students"]
    ] == [("second同學", "乙的理由", []), ("third同學", "丙的理由", ["夜裡"])]
    assert (first["confirmed"], first["unconfirmed"]) == (3, 0)


def test_empty_options_are_listed(client, tutor):
    s = setup(client, questions=[question("q1", "三選一", options=("拉", "不拉", "不知道"))])
    attempt = ok(start(client, s["activity_id"]))
    set_attempt(attempt["id"], "reviewing", 0, answered("o2", "o2"))

    first = teacher_view(client, s)["questions"][0]
    assert [(o["option_id"], o["count"]) for o in first["options"]] == [
        ("o0", 0),
        ("o1", 0),
        ("o2", 1),
    ]


def test_changed_stance_counts(client, tutor):
    s = setup(client, questions=two_questions())
    moved = ok(start(client, s["activity_id"]))
    stayed = student(client, s, "stayed")
    set_attempt(moved["id"], "between_questions", 0, answered("o0", "o1"))
    set_attempt(stayed["id"], "between_questions", 0, answered("o0", "o0"))
    with storage.transaction() as db:
        row = db.get(SoloAttempt, stayed["id"])
        entries = [dict(entry) for entry in row.progress]
        # Rewording the position in free text is not a changed stance; only option ids count.
        entries[0]["confirmed_summary"] = summary("理由", current_position="完全不同的說法")
        row.progress = entries

    first = teacher_view(client, s)["questions"][0]
    assert (first["changed"], first["comparable"]) == (1, 2)
    (moved_row,) = first["options"][1]["students"]
    assert moved_row["display_name"] == "student同學"
    assert moved_row["changed_from_option_id"] == "o0"
    (stayed_row,) = first["options"][0]["students"]
    assert stayed_row["changed_from_option_id"] is None


def test_changed_requires_both_values(client, tutor):
    s = setup(client, questions=two_questions())
    attempt = ok(start(client, s["activity_id"]))
    legacy = answered("o0", "o1")
    legacy["option_id"] = None
    set_attempt(attempt["id"], "between_questions", 0, legacy)

    first = teacher_view(client, s)["questions"][0]
    assert (first["changed"], first["comparable"], first["confirmed"]) == (0, 0, 1)
    assert [o["count"] for o in first["options"]] == [0, 1]
    assert first["options"][1]["students"][0]["changed_from_option_id"] is None


def test_unconfirmed_includes_not_reached(client, tutor):
    s = setup(client, questions=two_questions())
    attempt = ok(start(client, s["activity_id"]))
    set_attempt(attempt["id"], "between_questions", 0, answered("o0", "o0"))

    view = teacher_view(client, s)
    assert [(q["confirmed"], q["unconfirmed"]) for q in view["questions"]] == [(1, 0), (0, 1)]
    live = ok(progress(client, s["activity_id"]))
    assert [q["unconfirmed"] for q in view["questions"]] == live["summary"][
        "unconfirmed_by_question"
    ]


def test_summary_counts_match_progress(client, tutor):
    s = setup(client, questions=two_questions())
    talking = ok(start(client, s["activity_id"]))
    between = student(client, s, "between")
    review = student(client, s, "review")
    join(client, s["course"], "idle")
    set_attempt(talking["id"], "in_dialogue", 0, answered("o0"))
    set_attempt(between["id"], "between_questions", 0, answered("o0", "o0"))
    set_attempt(review["id"], "reviewing", 1, answered("o0", "o1"), answered("o1", "o1"))

    view = teacher_view(client, s)
    assert view["summary"] == {"enrolled": 4, "started": 3, "done": 1, "in_progress": 2}
    live = ok(progress(client, s["activity_id"]))
    assert view["summary"]["done"] == live["summary"]["done"]
    assert view["summary"]["started"] == live["summary"]["started"]


def test_questions_matched_by_question_id(client, tutor):
    s = setup(client, questions=two_questions())
    attempt = ok(start(client, s["activity_id"]))
    with storage.transaction() as db:
        row = db.get(SoloAttempt, attempt["id"])
        entries = [dict(entry) for entry in row.progress]
        q1 = next(e for e in entries if e["question_id"] == "q1")
        q2 = next(e for e in entries if e["question_id"] == "q2")
        q1.update(answered("o0", "o0", reason="第一題的理由"))
        q2.update(answered("o1", "o1", reason="第二題的理由"))
        row.progress = [q2, q1]
        row.state = "reviewing"
        row.question_index = 1

    first, second = teacher_view(client, s)["questions"]
    assert (first["index"], first["question_id"], first["title"]) == (0, "q1", "岔道上的選擇")
    assert [o["count"] for o in first["options"]] == [1, 0]
    assert first["options"][0]["students"][0]["reason_summary"] == "第一題的理由"
    assert (second["index"], second["question_id"], second["title"]) == (1, "q2", "天橋上的胖子")
    assert [o["count"] for o in second["options"]] == [0, 1]
    assert second["options"][1]["students"][0]["reason_summary"] == "第二題的理由"


def test_other_revision_not_aggregated(client, tutor):
    s = setup(client, questions=two_questions())
    counted = ok(start(client, s["activity_id"]))
    stray = student(client, s, "stray")
    set_attempt(counted["id"], "between_questions", 0, answered("o0", "o0"))
    set_attempt(stray["id"], "reviewing", 1, answered("o1", "o1"), answered("o1", "o1"))
    with storage.transaction() as db:
        current = db.get(ActivityRevision, db.get(Activity, s["activity_id"]).current_revision_id)
        other = ActivityRevision(
            activity_id=s["activity_id"],
            number=current.number + 1,
            content=current.content,
            content_hash="other",
        )
        db.add(other)
        db.flush()
        db.get(SoloAttempt, stray["id"]).revision_id = other.id

    view = teacher_view(client, s)
    assert view["revision_id"] == current.id
    assert view["summary"] == {"enrolled": 2, "started": 1, "done": 0, "in_progress": 1}
    first, second = view["questions"]
    assert [o["count"] for o in first["options"]] == [1, 0]
    assert (first["confirmed"], second["confirmed"], second["unconfirmed"]) == (1, 0, 1)


def test_draft_activity_reads_as_zero(client):
    user(client, "owner")
    course = create_course(client)
    body = create_activity(client, course["id"], questions=two_questions())

    view = ok(analysis(client, body["id"]))
    assert view["status"] == "draft"
    assert view["revision_id"] is None
    assert view["question_count"] == 2
    assert view["course_id"] == course["id"]
    assert view["summary"] == {"enrolled": 0, "started": 0, "done": 0, "in_progress": 0}
    assert [
        (q["index"], q["question_id"], q["title"], q["confirmed"], q["unconfirmed"])
        for q in view["questions"]
    ] == [(0, "q1", "岔道上的選擇", 0, 0), (1, "q2", "天橋上的胖子", 0, 0)]
    assert [(o["option_id"], o["count"]) for o in view["questions"][0]["options"]] == [
        ("o0", 0),
        ("o1", 0),
    ]
