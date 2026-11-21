"""Question normalisation shared by authoring and classroom execution."""

from copy import deepcopy
from typing import Any, cast

OTHER_ID = "__other__"


def ensure_other_options(document: dict[str, Any]) -> dict[str, Any]:
    """Return a copy whose every question contains one canonical Other option."""
    value = deepcopy(document)
    for question in value.get("questions", []):
        options = question.setdefault("options", [])
        if any(
            option.get("id") == OTHER_ID or str(option.get("text", "")).strip() == "其他"
            for option in options
        ):
            continue
        options.append({"id": OTHER_ID, "text": "其他"})
    return value


def ensure_other_question(question: dict[str, Any]) -> dict[str, Any]:
    value = {"questions": [deepcopy(question)]}
    return cast(dict[str, Any], ensure_other_options(value)["questions"][0])
