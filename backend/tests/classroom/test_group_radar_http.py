"""分組課每題的雷達（第 6 卡）：沿用單人活動的 RadarView，只給老師，學生以確認過的個人 baseline 為準。"""

import asyncio
import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.classroom_app import create_app
from app.modules.ai_providers import classroom_gateway
from app.modules.ai_providers.contracts import EmbeddingUnavailable
from app.modules.analytics import radar
from app.modules.analytics.group_analysis import pseudonym
from app.modules.classroom_core.repositories import Membership, Room
from app.modules.platform import storage as storage
from tests.classroom.test_group_analysis_http import assert_no_raw_member_ids, untyped_fields
from tests.classroom.test_group_personal import answer_in_group
from tests.classroom.test_group_stance import drive_to_confirmed
from tests.classroom.test_groups import classroom, start  # noqa: F401

FOLLOW_UP = "我指的是排隊的時間"
BINDING = {"adapter": "fixture", "profile_id": "p1", "model": "m1"}
DIMENSIONS = {
    "dimensions": [
        {"name": f"維度{i}", "low_pole": f"低端{i}", "high_pole": f"高端{i}"} for i in range(4)
    ]
}


def scores(value=3, ref="m2", quote="排隊的時間"):
    return {
        "scores": [
            {
                "dimension_index": i,
                "score": value,
                "sources": [{"message_ref": ref, "quote": quote}],
            }
            for i in range(4)
        ]
    }


@pytest.fixture
def provider(monkeypatch):
    """The classroom's bindings, and a scripted model: each call pops the next reply."""
    calls: list[dict] = []
    replies: list = []

    async def generate(binding, messages, schema, on_delta):
        calls.append({"binding": binding, "messages": messages})
        reply = replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return json.loads(json.dumps(reply)), {"provider": binding["adapter"]}

    monkeypatch.setattr(classroom_gateway, "generate", generate)
    monkeypatch.setattr(radar, "room_provider_chain", lambda *args: ([BINDING], {}))
    return calls, replies


def sent(call):
    return json.dumps(call["messages"], ensure_ascii=False)


def get_radar(rid, index=0):
    with TestClient(create_app(background=False)) as client:
        return client.get(f"/api/v2/groups/classrooms/{rid}/questions/{index}/radar")


def confirmed_classroom(classroom):  # noqa: F811
    """Two groups; both students of the first confirm their baseline, the second only answers."""
    result, _ = start(classroom, count=2, capacity=2)
    rid = classroom[0]
    first, second = result["groups"]
    with storage.transaction() as db:
        members = drive_to_confirmed(db, first["id"], ["a", "b"])
        (waiting,) = answer_in_group(db, second["id"], ["a"])
        row = db.get(Room, first["id"])
        run_id = row.state["runs"][0]["id"]
        ids = [
            m
            for g in result["groups"]
            for m in db.get(Room, g["id"]).state["group"]["member_snapshot"]
        ]
    return rid, members, waiting, run_id, ids


# ---- who may read it, and when it is ready -------------------------------------------------


def test_only_the_teacher_reads_the_radar(classroom, provider):  # noqa: F811
    start(classroom, count=1, capacity=3)
    rid, selected, _ = classroom
    with storage.transaction() as db:
        row = db.scalar(
            select(Membership).where(Membership.room_id == rid, Membership.role == "student")
        )
        selected["id"] = row.account_id
    r = get_radar(rid)
    assert (r.status_code, r.json()) == (403, {"detail": "TEACHER_MEMBERSHIP_REQUIRED"})


def test_no_confirmed_baseline_is_not_ready(classroom, provider):  # noqa: F811
    result, _ = start(classroom, count=1, capacity=3)
    rid = classroom[0]
    with storage.transaction() as db:
        answer_in_group(db, result["groups"][0]["id"], ["a", "b"])
    r = get_radar(rid)
    assert (r.status_code, r.json()) == (409, {"detail": "RADAR_NOT_READY"})
    assert provider[0] == []


def test_without_a_provider_the_radar_is_not_ready(classroom, provider, monkeypatch):  # noqa: F811
    rid, *_ = confirmed_classroom(classroom)
    monkeypatch.setattr(radar, "room_provider_chain", lambda *args: ([], {}))
    assert get_radar(rid).json() == {"detail": "RADAR_NOT_READY"}


def test_a_question_the_classroom_does_not_have(classroom, provider):  # noqa: F811
    rid, *_ = confirmed_classroom(classroom)
    r = get_radar(rid, index=3)
    assert (r.status_code, r.json()) == (404, {"detail": "QUESTION_REQUIRED"})


# ---- the scoring route ---------------------------------------------------------------------


def test_confirmed_students_are_scored_with_quotes_from_their_follow_up(classroom, provider):  # noqa: F811
    calls, replies = provider
    rid, members, waiting, run_id, ids = confirmed_classroom(classroom)
    replies.extend([DIMENSIONS, scores(), scores(1)])
    r = get_radar(rid)
    assert r.status_code == 200
    view = r.json()
    assert [(d["index"], d["source"]) for d in view["dimensions"]] == [(i, "llm") for i in range(4)]
    # Only the two confirmed students, in seat order; the one who only answered is not there.
    expected = [pseudonym(rid, m) for m in members]
    assert [s["student_id"] for s in view["students"]] == expected
    assert pseudonym(rid, waiting) not in [s["student_id"] for s in view["students"]]
    assert all(s["display_name"].startswith("同學") for s in view["students"])
    first, second = view["students"]
    assert [score["score"] for score in first["scores"]] == [3.0] * 4
    assert [score["score"] for score in second["scores"]] == [1.0] * 4
    # The quote sits in the student's second message of the follow-up (the first is the answer).
    assert first["scores"][0]["sources"] == [
        {"message_id": f"{run_id}:{expected[0]}:2", "quote": "排隊的時間", "start": 4, "end": 9}
    ]
    assert FOLLOW_UP[4:9] == "排隊的時間"
    # The question frames the dimensions; each student is scored on their own confirmed baseline.
    assert "如何安排共同資源？" in sent(calls[0])
    assert "選甲" in sent(calls[1]) and "排隊的時間" in sent(calls[1])
    assert len(calls) == 3
    assert_no_raw_member_ids(view, ids)


def test_a_student_the_model_cannot_score_is_left_out(classroom, provider):  # noqa: F811
    _, replies = provider
    rid, members, *_ = confirmed_classroom(classroom)
    replies.extend([DIMENSIONS, scores(), RuntimeError("down")])
    (only,) = get_radar(rid).json()["students"]
    assert only["student_id"] == pseudonym(rid, members[0])


def test_no_dimensions_means_not_ready(classroom, provider):  # noqa: F811
    _, replies = provider
    rid, *_ = confirmed_classroom(classroom)
    replies.append(RuntimeError("down"))
    assert get_radar(rid).json() == {"detail": "RADAR_NOT_READY"}


def test_ai_students_are_left_out():
    state = {
        "group": {"member_snapshot": ["m1", "ai1"]},
        "members": {"m1": {"alias": "同學"}, "ai1": {"alias": "AI", "actor_type": "llm_student"}},
        "runs": [
            {
                "id": "r1",
                "personal": {
                    "m1": personal_entry("student_confirmed"),
                    "ai1": personal_entry("ai_student"),
                },
            }
        ],
    }
    (only,) = radar._students("c1", [Room(id="g1", state=state)], 0)
    assert only["student_id"] == pseudonym("c1", "m1")


# ---- the vector route ----------------------------------------------------------------------


def personal_entry(source, position="選甲"):
    return {
        "messages": [{"role": "student", "text": "理由"}, {"role": "tutor", "text": "為什麼？"}],
        "baseline": {
            "position": position,
            "reason_summary": "先到的人承擔了等待的成本",
            "conditions": ["沒有緊急需求時"],
            "source": source,
        },
    }


def prepared(count):
    return {
        "account_id": "teacher",
        "bindings": [BINDING],
        "question_context": {"narrative": "如何安排共同資源？", "output_locale": "zh-Hant"},
        "students": [
            {
                "student_id": f"p-{i}",
                "display_name": f"同學{i}",
                "baseline": {
                    "current_position": f"立場{i}",
                    "reason_summary": "理由",
                    "relevant_conditions": [],
                },
                "refs": [("m1", (f"r1:p-{i}:1", "理由"))],
            }
            for i in range(count)
        ],
    }


def spread(count):
    return [[1.0 if i % 2 else -1.0, 0.1 * (i % 3), 0.0] for i in range(count)]


def test_fifteen_students_get_named_principal_axes(classroom, provider, monkeypatch):  # noqa: F811
    calls, replies = provider
    seen = []

    def embed(batch):
        seen.append(batch)
        return spread(len(batch))

    monkeypatch.setattr(radar, "embed", embed)
    replies.append(
        {"axes": [{"axis_index": 0, "name": "軸0", "low_pole": "低0", "high_pole": "高0"}]}
    )
    view = asyncio.run(radar.finish_radar(prepared(15)))
    assert seen == [[f"立場{i}。理由" for i in range(15)]]
    assert [(d["source"], d["name"]) for d in view["dimensions"]] == [("embedding", "軸0")]
    first_axis = sorted(s["scores"][0]["score"] for s in view["students"])
    assert first_axis[0] < 2 < first_axis[-1]
    assert all(score["sources"] == [] for s in view["students"] for score in s["scores"])
    assert len(calls) == 1


def test_without_the_embedding_model_fifteen_students_are_scored(
    classroom,  # noqa: F811
    provider,
    monkeypatch,
):
    _, replies = provider

    def missing(_):
        raise EmbeddingUnavailable("no model")

    monkeypatch.setattr(radar, "embed", missing)
    replies.extend([DIMENSIONS] + [scores(ref="m1", quote="理由")] * 15)
    view = asyncio.run(radar.finish_radar(prepared(15)))
    assert {d["source"] for d in view["dimensions"]} == {"llm"}
    assert len(view["students"]) == 15


# ---- the contract --------------------------------------------------------------------------


def test_the_radar_publishes_the_solo_radar_contract(classroom):  # noqa: F811
    app = create_app(background=False)
    path = "/api/v2/groups/classrooms/{rid}/questions/{index}/radar"
    operation = app.openapi()["paths"][path]["get"]
    schema = operation["responses"]["200"]["content"]["application/json"]["schema"]
    assert schema == {"$ref": "#/components/schemas/RadarView"}
    assert {"RadarDimensionView", "RadarStudentView", "CitationSourceView"} <= untyped_fields(
        app.openapi()["components"]["schemas"], "RadarView"
    )
