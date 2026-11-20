from fastapi.routing import APIRoute

from app.classroom_app import create_app
from app.modules.contract.contracts import RESPONSE_MODEL_PENDING

SAVED = [
    ("POST", "/api/v2/scripts"),
    ("PUT", "/api/v2/scripts/{script_id}"),
    ("POST", "/api/v2/scripts/import"),
]
YAML = ("GET", "/api/v2/scripts/{script_id}/yaml")
ASSIST = ("POST", "/api/v2/scripts/assist")


def _operations():
    app = create_app(background=False)
    routes = {
        (method, route.path): route
        for route in app.routes
        if isinstance(route, APIRoute)
        for method in route.methods or set()
    }
    return routes, app.openapi()["paths"]


def _ok_content(paths, method, path):
    return paths[path][method.lower()]["responses"]["200"]["content"]


def test_the_five_script_authoring_endpoints_leave_the_pending_list():
    routes, _ = _operations()
    for method, path in [*SAVED, YAML, ASSIST]:
        assert f"{method} {path}" not in RESPONSE_MODEL_PENDING
        assert routes[(method, path)].response_model is not None


def test_saving_importing_and_updating_a_script_answer_with_script_view():
    _, paths = _operations()
    for method, path in SAVED:
        schema = _ok_content(paths, method, path)["application/json"]["schema"]
        assert schema == {"$ref": "#/components/schemas/ScriptView"}, (method, path)


def test_ai_assist_answers_with_a_published_shape():
    _, paths = _operations()
    schema = _ok_content(paths, *ASSIST)["application/json"]["schema"]
    assert schema == {"$ref": "#/components/schemas/ScriptAssistView"}


def test_the_yaml_export_is_typed_as_yaml_text():
    _, paths = _operations()
    assert _ok_content(paths, *YAML) == {"application/yaml": {"schema": {"type": "string"}}}
