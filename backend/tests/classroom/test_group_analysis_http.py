"""analytics 的分組分析端點：掛上 response_model 後，HTTP 回應仍與 projection 逐欄相同。"""

import time
from fastapi.testclient import TestClient
from app.classroom_app import create_app
from app.modules.platform import storage as storage
from app.modules.classroom_core.orchestrator import GameOrchestrator
from app.modules.classroom_core.repositories import Room, persist_machine
from app.modules.analytics.group_analysis import analysis as project_analysis
from app.modules.analytics.routes import analysis
from tests.classroom.test_group_stance import drive_to_confirmed
from tests.classroom.test_groups import classroom, start  # noqa: F401


def get_analysis(rid):
    with TestClient(create_app(background=False)) as client:
        return client.get(f"/api/v2/groups/classrooms/{rid}/analysis")


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
    reply = group["nodes"][-2]["id"]
    assert (opening, reply) in {(e["source"], e["target"]) for e in group["edges"]}
    assert opening in group["roots"] and other in group["roots"]
    assert reply not in group["roots"]
    tree = {t["id"]: t["parent"] for t in group["tree_projection"]}
    assert tree[reply] == opening
    assert all("member_id" not in n for n in group["nodes"])
    assert all(p["id"].startswith("p-") for p in group["persons"])
    assert [s["confirmed"] for s in group["stances"]] == [2]


def test_analysis_publishes_its_response_schema(classroom):  # noqa: F811
    app = create_app(background=False)
    operation = app.openapi()["paths"]["/api/v2/groups/classrooms/{rid}/analysis"]["get"]
    schema = operation["responses"]["200"]["content"]["application/json"]["schema"]
    assert schema == {"$ref": "#/components/schemas/GroupAnalysisView"}
    properties = app.openapi()["components"]["schemas"]["GroupAnalysisView"]["properties"]
    assert "schema" in properties and "schema_" not in properties


def test_analysis_projection_of_a_group_without_statements(classroom):  # noqa: F811
    result, _ = start(classroom, count=1, capacity=3)
    rid, _, _ = classroom
    with storage.transaction() as db:
        rooms = [db.get(Room, g["id"]) for g in result["groups"]]
        expected = project_analysis(rid, rooms[0].state["title"], rooms)
    r = get_analysis(rid)
    assert (r.status_code, r.json()["groups"]) == (200, expected["groups"])
