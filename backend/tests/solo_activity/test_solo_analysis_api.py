"""T6 statistics: owner-only, each student's confirmed viewpoint (three fields), nothing else."""

import json

from app.modules.course_management.repositories import Activity, ActivityRevision
from app.modules.platform import storage as storage
from app.modules.solo_activity.repositories import SoloAttempt, SoloMessage
from tests.course_management.conftest import switch, user
from tests.course_management.test_activities_api import create_activity
from tests.course_management.test_courses_api import create_course
from tests.solo_activity.test_solo_attempts_api import SECOND, add_scenario, join, ok, setup, start
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


def set_attempt(attempt_id, state, scenario_index, *entries):
    """Write state and per-scenario progress straight in; the state machine has its own tests."""
    with storage.transaction() as db:
        row = db.get(SoloAttempt, attempt_id)
        row.state = state
        row.scenario_index = scenario_index
        current = [dict(entry) for entry in row.progress]
        for index, fields in enumerate(entries):
            current[index].update(fields)
        row.progress = current


def confirmed(reason="理由", conditions=(), **fields):
    return {
        "status": "goal_met",
        "confirmed_summary": summary(reason, conditions, **fields),
    }


def student(client, s, name):
    """Another enrolled student with a started attempt (logged in as them)."""
    join(client, s["course"], name)
    return ok(start(client, s["activity_id"]))


def teacher_view(client, s):
    switch(client, s["teacher"])
    return ok(analysis(client, s["activity_id"]))


def test_only_course_owner_can_read(client, tutor):
    s = setup(client)
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
    s = setup(client)
    with storage.transaction() as db:
        db.get(Activity, s["activity_id"]).deleted = True

    switch(client, s["teacher"])
    response = analysis(client, s["activity_id"])
    assert (response.status_code, response.json()) == (404, {"detail": "ACTIVITY_NOT_FOUND"})


def start_with_two_scenarios(client, activity_id):
    attempt = ok(start(client, activity_id))
    add_scenario(attempt["id"], SECOND)
    return attempt


def test_no_private_text_leaks(client, tutor):
    s = setup(client)
    attempt = start_with_two_scenarios(client, s["activity_id"])
    secret = {
        "message": "秘密訊息原文甲",
        "tutor": "秘密導師回覆乙",
        "answer": "秘密第一個回答丙",
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
        "confirmed_issue": "秘密確認疑問辰",
        "confirmed_note": "秘密確認原則巳",
        "label": "秘密原則標籤午",
        "observation": "秘密觀察未",
        "meta": "秘密訊息附註申",
        "scenario": "秘密後續情境酉",
    }
    shown = {
        "current_position": "公開確認立場亥",
        "reason_summary": "公開確認理由酉",
        "condition": "公開確認條件戌",
    }
    set_attempt(
        attempt["id"],
        "in_dialogue",
        1,
        {
            **confirmed(
                shown["reason_summary"],
                [shown["condition"]],
                current_position=shown["current_position"],
                unresolved_issue=secret["confirmed_issue"],
                principle_note=secret["confirmed_note"],
            ),
            "answer": secret["answer"],
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
        },
        {"text": secret["scenario"]},
    )
    with storage.transaction() as db:
        db.add_all(
            [
                SoloMessage(
                    attempt_id=attempt["id"],
                    seq=1,
                    scenario_index=0,
                    role="student",
                    text=secret["message"],
                    meta={"revise_hint": secret["meta"]},
                ),
                SoloMessage(
                    attempt_id=attempt["id"],
                    seq=2,
                    scenario_index=0,
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


def test_an_unconfirmed_student_has_an_empty_viewpoint(client, tutor):
    s = setup(client)
    attempt = ok(start(client, s["activity_id"]))
    set_attempt(attempt["id"], "in_dialogue", 0, {"answer": "還在想"})

    (row,) = teacher_view(client, s)["students"]
    assert (row["display_name"], row["confirmed_scenarios"]) == ("student同學", 0)
    assert (row["current_position"], row["reason_summary"], row["relevant_conditions"]) == (
        "",
        "",
        [],
    )


def test_each_student_shows_the_latest_confirmed_viewpoint(client, tutor):
    s = setup(client)
    a = start_with_two_scenarios(client, s["activity_id"])
    b = student(client, s, "second")
    add_scenario(b["id"], SECOND)
    c = student(client, s, "third")
    set_attempt(
        a["id"],
        "between_scenarios",
        0,
        confirmed("甲的理由", current_position="甲拉"),
    )
    set_attempt(
        b["id"],
        "in_dialogue",
        1,
        confirmed("乙第一個情境的理由", current_position="乙不拉"),
        confirmed("乙第二個情境的理由", ["夜裡"], current_position="乙改拉"),
    )
    set_attempt(c["id"], "in_dialogue", 0, {})

    rows = teacher_view(client, s)["students"]
    # Every student who started, in enrollment order; the later confirmation wins.
    assert [
        (
            x["display_name"],
            x["confirmed_scenarios"],
            x["current_position"],
            x["reason_summary"],
            x["relevant_conditions"],
        )
        for x in rows
    ] == [
        ("student同學", 1, "甲拉", "甲的理由", []),
        ("second同學", 2, "乙改拉", "乙第二個情境的理由", ["夜裡"]),
        ("third同學", 0, "", "", []),
    ]
    assert all(x["enrollment_id"] for x in rows)


def test_not_started_students_are_not_listed(client, tutor):
    s = setup(client)
    join(client, s["course"], "idle")

    view = teacher_view(client, s)
    assert view["summary"] == {"enrolled": 2, "started": 0, "done": 0, "in_progress": 0}
    assert view["students"] == []


def test_summary_counts_match_progress(client, tutor):
    s = setup(client)
    talking = ok(start(client, s["activity_id"]))
    between = student(client, s, "between")
    review = student(client, s, "review")
    join(client, s["course"], "idle")
    add_scenario(between["id"], SECOND)
    add_scenario(review["id"], SECOND)
    set_attempt(talking["id"], "in_dialogue", 0, {})
    set_attempt(between["id"], "between_scenarios", 0, confirmed())
    set_attempt(review["id"], "reviewing", 1, confirmed(), confirmed())

    view = teacher_view(client, s)
    assert view["summary"] == {"enrolled": 4, "started": 3, "done": 1, "in_progress": 2}
    live = ok(progress(client, s["activity_id"]))
    assert view["summary"]["done"] == live["summary"]["done"]
    assert view["summary"]["started"] == live["summary"]["started"]


def test_other_revision_not_aggregated(client, tutor):
    s = setup(client)
    counted = ok(start(client, s["activity_id"]))
    stray = student(client, s, "stray")
    set_attempt(counted["id"], "reviewing", 0, confirmed("算進來的理由"))
    set_attempt(stray["id"], "reviewing", 0, confirmed("不該算的理由"))
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
    assert view["summary"] == {"enrolled": 2, "started": 1, "done": 1, "in_progress": 0}
    assert [x["reason_summary"] for x in view["students"]] == ["算進來的理由"]


def test_draft_activity_reads_as_zero(client):
    user(client, "owner")
    course = create_course(client)
    body = create_activity(client, course["id"])

    view = ok(analysis(client, body["id"]))
    assert view["status"] == "draft"
    assert view["revision_id"] is None
    assert view["course_id"] == course["id"]
    assert view["summary"] == {"enrolled": 0, "started": 0, "done": 0, "in_progress": 0}
    assert view["students"] == []
