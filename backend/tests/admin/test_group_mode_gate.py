"""多人模式關閉時，分組課的每個端點、WebSocket 都擋下；題庫與單人活動照常（spec P8、P22）。"""

import pytest
from fastapi import WebSocketDisconnect
from fastapi.routing import APIRoute

from app.modules.platform import storage
from app.modules.platform import toggles
from tests.classroom.test_group_guest_block import QUERY, REQUESTS, group_routes
from tests.course_management.conftest import user

ANALYSIS = ("GET", "/api/v2/groups/classrooms/{rid}/analysis")
RADAR = ("GET", "/api/v2/groups/classrooms/{rid}/questions/{index}/radar")
ORIGIN = {"Origin": "http://testserver"}


def turn(enabled: bool) -> None:
    with storage.transaction() as db:
        toggles.set_toggle(db, "group_mode", enabled, "test", 0.0)


def test_every_group_endpoint_is_covered(client):
    assert group_routes(client.app) == set(REQUESTS)
    analytics = {
        (method, route.path)
        for route in client.app.routes
        if isinstance(route, APIRoute)
        and route.endpoint.__module__.startswith("app.modules.analytics.")
        for method in route.methods
    }
    assert analytics == {ANALYSIS, RADAR}


@pytest.mark.parametrize(("method", "path"), sorted(REQUESTS) + [ANALYSIS, RADAR])
def test_every_group_endpoint_is_closed_while_group_mode_is_off(client, method, path):
    user(client, "lin", account_role="teacher")
    url = path.format(script_id="x", room_id="x", index=0, rid="x", mid="x", cid="x")
    response = client.request(
        method, url, json=REQUESTS.get((method, path)), params=QUERY.get(path), headers=ORIGIN
    )
    assert (response.status_code, response.json()) == (403, {"detail": "GROUP_MODE_DISABLED"})


def test_turning_group_mode_on_opens_them_again(client):
    user(client, "lin", account_role="teacher")
    assert client.get("/api/v2/classrooms").status_code == 403
    turn(True)
    assert client.get("/api/v2/classrooms").status_code == 200


def test_the_question_bank_and_scripts_stay_open(client):
    user(client, "lin", account_role="teacher")
    assert client.get("/api/v2/scripts").status_code == 200
    assert client.get("/api/v2/bank/questions").status_code == 200


def test_a_new_classroom_socket_is_refused(client):
    user(client, "lin", account_role="teacher")
    with pytest.raises(WebSocketDisconnect) as closed:
        with client.websocket_connect("/api/v2/classrooms/x/ws", headers=ORIGIN):
            pass
    assert closed.value.code == 4403


def test_an_open_classroom_socket_closes_on_its_next_message(client):
    from tests.classroom.test_api import DOC

    user(client, "lin", account_role="teacher")
    turn(True)
    script = client.post("/api/v2/scripts", json={"document": DOC}).json()
    room = client.post("/api/v2/classrooms", json={"script_id": script["id"]})
    assert room.status_code == 200, room.text
    with client.websocket_connect(
        f"/api/v2/classrooms/{room.json()['id']}/ws?mode=teacher", headers=ORIGIN
    ) as ws:
        assert ws.receive_json()["type"] == "replay"
        assert ws.receive_json()["type"] == "snapshot"
        turn(False)
        ws.send_json({"type": "ping", "sent_at": 1})
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
        assert closed.value.code == 4403


def test_an_idle_classroom_socket_closes_when_it_wakes(client, monkeypatch):
    from app.modules.classroom_core import routes as classroom_routes
    from tests.classroom.test_api import DOC

    monkeypatch.setattr(classroom_routes, "IDLE_SECONDS", 0.2)
    user(client, "lin", account_role="teacher")
    turn(True)
    script = client.post("/api/v2/scripts", json={"document": DOC}).json()
    room = client.post("/api/v2/classrooms", json={"script_id": script["id"]}).json()
    with client.websocket_connect(
        f"/api/v2/classrooms/{room['id']}/ws?mode=teacher", headers=ORIGIN
    ) as ws:
        assert ws.receive_json()["type"] == "replay"
        assert ws.receive_json()["type"] == "snapshot"
        turn(False)
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
        assert closed.value.code == 4403
