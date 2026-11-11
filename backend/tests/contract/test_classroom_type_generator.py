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
