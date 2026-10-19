"""SoloTutorTurn is validated against the personal_tutor prompt's schema; the two must not drift.

solo_dialogue cannot import classroom_core (classroom_core already depends on solo_dialogue),
so the solo copy is locked here instead of shared. Moving PersonalTutorTurn into llm_runtime
removes this test.
"""

from app.modules.llm_runtime.tutor.prompts import SCHEMAS
from app.modules.solo_dialogue.domain.solo_outputs import SoloTutorTurn


def _shape(schema: dict) -> dict:
    """Required fields and nested field names, with $ref resolved against $defs."""
    defs = schema.get("$defs", {})

    def walk(node: dict) -> dict:
        if "$ref" in node:
            node = defs[node["$ref"].rsplit("/", 1)[-1]]
        if "allOf" in node and len(node["allOf"]) == 1:
            node = walk(node["allOf"][0])
        if node.get("type") == "array" and "items" in node:
            return {"items": walk(node["items"])}
        if "properties" not in node:
            return {}
        return {
            "required": sorted(node.get("required", [])),
            "properties": {name: walk(sub) for name, sub in node["properties"].items()},
        }

    return walk(schema)


def test_solo_tutor_turn_matches_personal_tutor_schema():
    personal = SCHEMAS["PersonalTutorTurn"].model_json_schema()
    solo = SoloTutorTurn.model_json_schema()
    assert _shape(solo) == _shape(personal)
