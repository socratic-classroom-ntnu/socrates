from fastapi.routing import APIRoute

from app.classroom_app import create_app
from app.modules.contract.contracts import RESPONSE_MODEL_PENDING

FOCUS = {
    "POST /api/v2/scripts/{script_id}/adopt-question/{room_id}/{index}",
    "POST /api/v2/classrooms/{room_id}/commands",
    "POST /api/v2/classrooms/{room_id}/reactions",
    "GET /api/v2/classrooms/{room_id}/events",
    "POST /api/v2/classrooms/{room_id}/budget",
    "POST /api/v2/library/classrooms",
    "GET /api/v2/library/classrooms/{cid}",
    "POST /api/v2/library/classrooms/{cid}/scripts",
    "POST /api/v2/library/classrooms/{cid}/batches",
    "GET /api/v2/library/classrooms/{cid}/ai-settings",
    "PUT /api/v2/library/classrooms/{cid}/ai-settings",
    "POST /api/v2/groups/classrooms/{rid}/configure",
    "POST /api/v2/groups/classrooms/{rid}/start",
    "GET /api/v2/groups/classrooms/{rid}",
    "POST /api/v2/groups/runs/{rid}/commands",
    "GET /api/v2/groups/runs/{rid}/members/{mid}/identity",
    "POST /api/v2/groups/classrooms/{rid}/ai-students",
    "POST /api/v2/groups/classrooms/{rid}/ai-students/clear",
    "POST /api/v2/suggestions/other",
}


def test_classroom_core_and_group_dialogue_routes_publish_response_models():
    routes = {}
    for route in create_app(background=False).routes:
        if not isinstance(route, APIRoute):
            continue
        for method in route.methods or set():
            routes[f"{method} {route.path}"] = route
    assert FOCUS <= routes.keys()
    assert not (FOCUS & set(RESPONSE_MODEL_PENDING))
    assert all(routes[key].response_model is not None for key in FOCUS)


def test_group_view_schema_is_generated_into_openapi():
    schemas = create_app(background=False).openapi()["components"]["schemas"]
    for name in ["GroupCollectionView", "GroupRunView", "LegacyGroupView"]:
        assert name in schemas
