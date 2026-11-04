"""Provider-specific JSON Schema projections for structured model output."""

from copy import deepcopy
from typing import Any, cast

from pydantic import BaseModel


def _inline_refs(value: Any, definitions: dict[str, Any], stack: tuple[str, ...] = ()) -> Any:
    if isinstance(value, list):
        return [_inline_refs(item, definitions, stack) for item in value]
    if not isinstance(value, dict):
        return value
    if "$ref" in value:
        name = value["$ref"].rsplit("/", 1)[-1]
        if name in stack:
            raise ValueError(f"recursive provider schema: {' -> '.join((*stack, name))}")
        target = deepcopy(definitions[name])
        target.update({key: item for key, item in value.items() if key != "$ref"})
        return _inline_refs(target, definitions, (*stack, name))
    return {
        key: _inline_refs(item, definitions, stack)
        for key, item in value.items()
        if key not in {"$defs", "definitions"}
    }


def _base_schema(model: type[BaseModel]) -> dict[str, Any]:
    source = model.model_json_schema()
    definitions = source.get("$defs") or source.get("definitions") or {}
    return cast(dict[str, Any], _inline_refs(source, definitions))


def _without_metadata(value: Any, *, field_map: bool = False) -> Any:
    """Drop schema annotations; keys of a ``properties`` map are field names and stay."""
    if isinstance(value, list):
        return [_without_metadata(item) for item in value]
    if not isinstance(value, dict):
        return value
    if field_map:
        return {key: _without_metadata(item) for key, item in value.items()}
    return {
        key: _without_metadata(item, field_map=key == "properties")
        for key, item in value.items()
        if key not in {"title", "default"}
    }


def _openai_strict(value: Any) -> Any:
    if isinstance(value, list):
        return [_openai_strict(item) for item in value]
    if not isinstance(value, dict):
        return value
    result = {key: _openai_strict(item) for key, item in value.items()}
    properties = result.get("properties")
    if isinstance(properties, dict):
        result["required"] = list(properties)
        result["additionalProperties"] = False
    elif result.get("type") == "object":
        result["additionalProperties"] = False
    return result


def openai_response_schema(model: type[BaseModel]) -> dict[str, Any]:
    """Schema accepted by OpenAI-compatible strict structured-output endpoints."""
    return cast(dict[str, Any], _openai_strict(_without_metadata(_base_schema(model))))


def _gemini(value: Any, *, field_map: bool = False) -> Any:
    if isinstance(value, list):
        return [_gemini(item) for item in value]
    if not isinstance(value, dict):
        return value
    if field_map:
        # Keys of a ``properties`` map are field names (a field may be called "title").
        return {key: _gemini(item) for key, item in value.items()}
    any_of = value.get("anyOf")
    if isinstance(any_of, list):
        non_null = [item for item in any_of if item.get("type") != "null"]
        has_null = len(non_null) != len(any_of)
        if has_null and len(non_null) == 1:
            result = _gemini(non_null[0])
            if isinstance(result, dict):
                result["nullable"] = True
                for key in ("description", "enum"):
                    if key in value and key not in result:
                        result[key] = _gemini(value[key])
            return result
    result = {}
    for key, item in value.items():
        if key in {"title", "default", "additionalProperties", "$defs", "definitions"}:
            continue
        if key == "const":
            result["enum"] = [_gemini(item)]
            continue
        result[key] = _gemini(item, field_map=key == "properties")
    return result


def gemini_response_schema(model: type[BaseModel]) -> dict[str, Any]:
    """Inline, nullable-aware schema accepted by Gemini responseSchema."""
    return cast(dict[str, Any], _gemini(_base_schema(model)))
