"""分組課這一輪不開放訪客：classroom-core、group-dialogue 的每個端點都對訪客回 GUEST_NOT_ALLOWED。"""

import pytest
from fastapi import WebSocketDisconnect
from fastapi.routing import APIRoute

from app.modules.identity_access import service as auth
from app.modules.platform import storage
from app.modules.platform.errors import DomainError
from tests.classroom.test_guest_accounts import client, join  # noqa: F401

MODULES = ("app.modules.classroom_core.", "app.modules.group_dialogue.")
ACTION = {"action_id": "guest-action-0001"}
DIGEST = {**ACTION, "expected_roster_digest": "x"}
QUESTION = {"question_id": "q1", "title": "題目", "scenario": "情境"}

# 每個端點一列：新增端點而沒有加進來時，test_every_endpoint_is_listed 會紅
REQUESTS = {
    ("POST", "/api/v2/scripts/{script_id}/adopt-question/{room_id}/{index}"): None,
    ("POST", "/api/v2/classrooms"): {"script_id": "x"},
    ("POST", "/api/v2/classrooms/join"): {"code": "x", "alias": "訪客"},
    ("GET", "/api/v2/classrooms"): None,
    ("GET", "/api/v2/classrooms/{room_id}"): None,
    ("POST", "/api/v2/classrooms/{room_id}/commands"): {**ACTION, "kind": "draft"},
    ("POST", "/api/v2/classrooms/{room_id}/reactions"): {
        **ACTION,
        "kind": "like",
        "focus_id": "x",
        "turn_index": 0,
    },
    ("GET", "/api/v2/classrooms/{room_id}/events"): None,
    ("POST", "/api/v2/classrooms/{room_id}/budget"): None,
    ("POST", "/api/v2/groups/classrooms/{rid}/configure"): {
        **DIGEST,
        "group_count": 1,
        "members_per_group": 1,
    },
    ("POST", "/api/v2/groups/classrooms/{rid}/start"): DIGEST,
    ("GET", "/api/v2/groups/classrooms/{rid}"): None,
    ("POST", "/api/v2/groups/runs/{rid}/commands"): {**ACTION, "kind": "group_statement"},
    ("GET", "/api/v2/groups/runs/{rid}/members/{mid}/identity"): None,
    ("GET", "/api/v2/library/classrooms"): None,
    ("POST", "/api/v2/library/classrooms"): {**ACTION, "title": "教室"},
    ("GET", "/api/v2/library/classrooms/{cid}"): None,
    ("POST", "/api/v2/library/classrooms/{cid}/scripts"): ACTION,
    ("POST", "/api/v2/library/classrooms/{cid}/batches"): {**ACTION, "script_id": "x"},
    ("GET", "/api/v2/library/classrooms/{cid}/ai-settings"): None,
    ("PUT", "/api/v2/library/classrooms/{cid}/ai-settings"): {},
    ("POST", "/api/v2/groups/classrooms/{rid}/ai-students"): {**ACTION, "count": 1},
    ("POST", "/api/v2/groups/classrooms/{rid}/ai-students/clear"): ACTION,
    ("POST", "/api/v2/suggestions/other"): QUESTION,
}
QUERY = {"/api/v2/classrooms/{room_id}/budget": {"live_llm_call_budget": 1}}


def group_routes(app):
    return {
        (method, route.path)
        for route in app.routes
        if isinstance(route, APIRoute) and route.endpoint.__module__.startswith(MODULES)
        for method in route.methods
    }


def test_every_endpoint_is_listed(client):  # noqa: F811
    assert group_routes(client.app) == set(REQUESTS)


@pytest.mark.parametrize(("method", "path"), sorted(REQUESTS))
def test_a_guest_session_is_refused(client, method, path):  # noqa: F811
    join(client)
    client.headers["Origin"] = "http://testserver"
    url = path.format(script_id="x", room_id="x", index=0, rid="x", mid="x", cid="x")
    r = client.request(method, url, json=REQUESTS[(method, path)], params=QUERY.get(path))
    assert (r.status_code, r.json()) == (403, {"detail": "GUEST_NOT_ALLOWED"})


def test_a_guest_session_cannot_open_the_classroom_socket(client):  # noqa: F811
    join(client)
    # WebSocket 的拒絕只有 close code，沒有 reason code
    with pytest.raises(WebSocketDisconnect) as closed:
        with client.websocket_connect(
            "/api/v2/classrooms/x/ws", headers={"Origin": "http://testserver"}
        ):
            pass
    assert closed.value.code == 4403
    # 4403 也涵蓋沒登入與找不到教室；socket 驗身分用的同一個呼叫，對這個 cookie 擋的是訪客
    with storage.transaction() as db, pytest.raises(DomainError, match="GUEST_NOT_ALLOWED"):
        auth.identity(db, client.cookies.get(auth.COOKIE))
