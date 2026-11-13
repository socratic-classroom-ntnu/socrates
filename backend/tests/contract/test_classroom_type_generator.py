"""Generated classroom TypeScript keeps public OpenAPI field semantics."""

import importlib.util
from pathlib import Path


def _generator_path(start: Path) -> Path:
    for parent in start.parents:
        candidate = parent / "scripts" / "gen_classroom_types.py"
        if candidate.is_file():
            return candidate
    raise FileNotFoundError("scripts/gen_classroom_types.py")


def test_generator_path_finds_repo_scripts_from_ci_backend_layout(tmp_path):
    repo = tmp_path / "repo"
    generator = repo / "scripts" / "gen_classroom_types.py"
    generator.parent.mkdir(parents=True)
    generator.touch()
    ci_test = repo / "backend" / "tests" / "contract" / "test_generator.py"

    assert _generator_path(ci_test) == generator


def _generator_module():
    path = _generator_path(Path(__file__).resolve())
    spec = importlib.util.spec_from_file_location("gen_classroom_types", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_object_property_descriptions_become_safe_jsdoc():
    schema = {
        "type": "object",
        "properties": {
            "start": {
                "type": "integer",
                "description": "UTF-16 code units; inclusive. */",
            }
        },
        "required": ["start"],
    }

    rendered = _generator_module().ts(schema)

    assert rendered == '{ /** UTF-16 code units; inclusive. *\\/ */ "start": number }'


def test_operation_types_include_body_success_and_empty_response():
    spec = {
        "paths": {
            "/api/v2/items/{item_id}": {
                "post": {
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/ItemInput"}
                            }
                        },
                    },
                    "responses": {
                        "201": {
                            "content": {
                                "application/json": {
                                    "schema": {"$ref": "#/components/schemas/ItemView"}
                                }
                            }
                        }
                    },
                },
                "delete": {"responses": {"204": {"description": "No Content"}}},
            }
        }
    }
    rendered = _generator_module().render_paths(spec)
    assert '"/items/{item_id}"' in rendered
    assert (
        '"post": { body: components["schemas"]["ItemInput"]; response: components["schemas"]["ItemView"]'
        in rendered
    )
    assert '"delete": { body: never; response: null' in rendered


def test_operation_types_keep_query_and_non_json_media():
    spec = {
        "paths": {
            "/api/v2/items": {
                "get": {
                    "parameters": [
                        {
                            "name": "offset",
                            "in": "query",
                            "required": False,
                            "schema": {"type": "integer"},
                        }
                    ],
                    "responses": {
                        "200": {"content": {"application/yaml": {"schema": {"type": "string"}}}}
                    },
                }
            }
        }
    }
    rendered = _generator_module().render_paths(spec)
    assert 'query: { "offset"?: number }' in rendered
    assert "response: string" in rendered


def test_reason_codes_are_read_from_literal_catalog_without_importing_backend(tmp_path):
    catalog = tmp_path / "contracts.py"
    catalog.write_text(
        'REASON_CODES = {"VISIBLE": ("owner",), "PRIVATE": ("owner",)}\n'
        'DYNAMIC_REASON_CODES = ("DYNAMIC",)\n'
        'SERVER_ONLY_REASON_CODES = ("PRIVATE",)\n'
    )
    assert _generator_module().render_reason_codes(catalog) == (
        "// Generated from backend/app/modules/contract/contracts.py.\n"
        'export type ClassroomReasonCode = "DYNAMIC" | "VISIBLE";\n'
    )
