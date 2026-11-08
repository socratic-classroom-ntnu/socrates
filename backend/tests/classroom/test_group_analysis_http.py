"""analytics 的分組分析端點：掛上 response_model 後，HTTP 回應仍與 projection 逐欄相同。"""

import json
import time
from fastapi.testclient import TestClient
from app.classroom_app import create_app
from app.modules.platform import storage as storage
from app.modules.classroom_core.orchestrator import GameOrchestrator
from sqlalchemy import select
from app.modules.classroom_core.repositories import Membership, Room, persist_machine
from app.modules.analytics.group_analysis import analysis as project_analysis
from app.modules.analytics.routes import analysis
from tests.classroom.test_group_stance import drive_to_confirmed
from tests.classroom.test_groups import classroom, start  # noqa: F401


def get_analysis(rid):
    with TestClient(create_app(background=False)) as client:
        return client.get(f"/api/v2/groups/classrooms/{rid}/analysis")


def assert_no_raw_member_ids(body, member_ids):
    text = json.dumps(body, ensure_ascii=False)
    assert member_ids and not [m for m in member_ids if m in text]


def snapshot_ids(db, groups):
    return [m for g in groups for m in db.get(Room, g["id"]).state["group"]["member_snapshot"]]


def test_analysis_wire_json_matches_the_projection(classroom):  # noqa: F811
    result, _ = start(classroom, count=2, capacity=2)
    rid, _, request = classroom
    first = result["groups"][0]
    with storage.transaction() as db:
        members = drive_to_confirmed(db, first["id"], ["a", "b"])
        row = db.get(Room, first["id"])
        machine = GameOrchestrator(row.state, time.time())
        machine.command("group_statement", {"text": "先到先取最公平"}, members[0], False)
        opening = machine.s["group"]["arguments"][0]["id"]
        # 學生只能接續自己的論點或已公開的論點
        machine.command(
            "group_statement",
            {"text": "但晚到的人不是故意的", "relation": "challenges", "parents": [opening]},
            members[0],
            False,
        )
        machine.command("group_statement", {"text": "平均分配才不偏袒"}, members[1], False)
        other = machine.s["group"]["arguments"][2]["id"]
        persist_machine(db, row, machine)
        member_ids = snapshot_ids(db, result["groups"])

    r = get_analysis(rid)
    assert r.status_code == 200
    body = r.json()
    # 路由函式直接呼叫時不經 response_model，拿來當 projection 的原樣
    assert body == analysis(rid, request)
    assert body["schema"] == "socrates/group-analysis/v1"
    group = next(g for g in body["groups"] if g["id"] == first["id"])
    # 確認個人立場時，作答理由已經先成為節點；這裡新增的三則接在後面
    assert [n["text"] for n in group["nodes"]][-3:] == [
        "先到先取最公平",
        "但晚到的人不是故意的",
        "平均分配才不偏袒",
    ]
    # 逐欄寫死前端依賴的形狀，不只和 projection 比：projection 改了欄位這裡會紅
    node = group["nodes"][-2]
    reply = node["id"]
    assert set(node) == {
        "id",
        "person_id",
        "nickname",
        "text",
        "at",
        "sequence",
        "stage",
        "question_index",
        "kind",
        "provenance",
        "visibility",
    }
    assert (node["kind"], node["provenance"], node["visibility"]) == (
        "statement",
        "student_original_quote",
        "personal",
    )
    assert node["person_id"] == group["persons"][0]["id"] and isinstance(node["at"], float)
    assert {
        "source": opening,
        "target": reply,
        "type": "challenges",
        "provenance": "student_selected_relation",
    } in group["edges"]
    assert group["settlement"] == {"state": "EXPLORING"}
    assert group["persons"][0]["timeline"][-2:] == group["nodes"][-3:-1]
    assert opening in group["roots"] and other in group["roots"]
    assert reply not in group["roots"]
    tree = {t["id"]: t["parent"] for t in group["tree_projection"]}
    assert tree[reply] == opening
    assert all("member_id" not in n for n in group["nodes"])
    assert all(p["id"].startswith("p-") for p in group["persons"])
    assert [s["confirmed"] for s in group["stances"]] == [2]
    assert_no_raw_member_ids(body, member_ids)


def test_analysis_of_a_teacher_ended_group_carries_the_settlement(classroom):  # noqa: F811
    result, _ = start(classroom, count=1, capacity=3)
    rid, _, _ = classroom
    gid = result["groups"][0]["id"]
    with storage.transaction() as db:
        row = db.get(Room, gid)
        machine = GameOrchestrator(row.state, time.time())
        machine.command("end", {}, None, True)
        persist_machine(db, row, machine)
        members = row.state["group"]["member_snapshot"]
    r = get_analysis(rid)
    assert r.status_code == 200
    settlement = r.json()["groups"][0]["settlement"]
    assert set(settlement) == {
        "state",
        "settled_at",
        "ended_by",
        "end_reason",
        "incomplete_members",
        "member_status",
    }
    assert (settlement["state"], settlement["ended_by"], settlement["end_reason"]) == (
        "SETTLED",
        "teacher",
        "teacher_force_end",
    )
    persons = sorted(p["id"] for p in r.json()["groups"][0]["persons"])
    assert sorted(settlement["incomplete_members"]) == persons
    assert settlement["member_status"] == {p: "incomplete" for p in persons}
    assert_no_raw_member_ids(r.json(), members)


def test_analysis_is_teacher_only_over_http(classroom):  # noqa: F811
    start(classroom, count=1, capacity=3)
    rid, selected, _ = classroom
    with storage.transaction() as db:
        row = db.scalar(
            select(Membership).where(Membership.room_id == rid, Membership.role == "student")
        )
        selected["id"] = row.account_id
    r = get_analysis(rid)
    assert (r.status_code, r.json()) == (403, {"detail": "TEACHER_MEMBERSHIP_REQUIRED"})


def test_analysis_publishes_its_response_schema(classroom):  # noqa: F811
    app = create_app(background=False)
    operation = app.openapi()["paths"]["/api/v2/groups/classrooms/{rid}/analysis"]["get"]
    schema = operation["responses"]["200"]["content"]["application/json"]["schema"]
    assert schema == {"$ref": "#/components/schemas/GroupAnalysisView"}
    properties = app.openapi()["components"]["schemas"]["GroupAnalysisView"]["properties"]
    assert "schema" in properties and "schema_" not in properties
    # 公開契約裡不留未定型的欄位（Any 或 dict[str, Any]），前端拿到的每個欄位都有型別
    schemas = app.openapi()["components"]["schemas"]
    seen = untyped_fields(schemas, "GroupAnalysisView")
    assert {"AnalysisNodeView", "AnalysisEdgeView", "SettlementView"} <= seen


def untyped_fields(schemas, root):
    """Walk every schema reachable from root; fail on an untyped field. Returns the names seen."""
    seen, pending = set(), [root]
    while pending:
        name = pending.pop()
        if name in seen:
            continue
        seen.add(name)

        def walk(node, where):
            if isinstance(node, dict):
                # Any 產生 {}；dict[str, Any] 產生沒有 properties、也沒有值型別的 object
                assert node != {}, where
                assert node.get("additionalProperties") is not True, where
                if node.get("type") == "object":
                    assert "properties" in node or isinstance(
                        node.get("additionalProperties"), dict
                    ), where
                if "$ref" in node:
                    pending.append(node["$ref"].rsplit("/", 1)[1])
                for key, value in node.items():
                    if key not in {"default", "const", "enum", "examples"}:
                        walk(value, f"{where}.{key}")
            elif isinstance(node, list):
                for value in node:
                    walk(value, where)

        walk(schemas[name].get("properties", {}), name)
    return seen


def test_analysis_projection_of_a_group_without_statements(classroom):  # noqa: F811
    result, _ = start(classroom, count=1, capacity=3)
    rid, _, _ = classroom
    with storage.transaction() as db:
        rooms = [db.get(Room, g["id"]) for g in result["groups"]]
        expected = project_analysis(rid, rooms[0].state["title"], rooms)
        member_ids = snapshot_ids(db, result["groups"])
    r = get_analysis(rid)
    assert (r.status_code, r.json()["groups"]) == (200, expected["groups"])
    assert_no_raw_member_ids(r.json(), member_ids)
