"""Generated classroom TypeScript keeps public OpenAPI field semantics."""

import importlib.util
from pathlib import Path


def _generator_module():
    path = Path(__file__).resolve().parents[2] / "scripts" / "gen_classroom_types.py"
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
