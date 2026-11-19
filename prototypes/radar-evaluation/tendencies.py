"""Prototype B's output check: each student's own 3–5 tendencies, every quote found verbatim."""

from __future__ import annotations

from typing import Any

from app.modules.llm_runtime.contracts import Citation
from app.modules.llm_runtime.service import locate_citation

MIN_TENDENCIES, MAX_TENDENCIES = 3, 5
MIN_QUOTES, MAX_QUOTES = 1, 3
STRENGTHS = range(0, 5)


class InvalidTendencies(ValueError):
    pass


def number_messages(scenarios: list[list[str]]) -> list[tuple[str, str]]:
    """m1, m2, … over both scenarios' student messages in order, as radar.begin_radar numbers them."""
    said = [text for messages in scenarios for text in messages]
    return [(f"m{number}", text) for number, text in enumerate(said, start=1)]


def _check(reply: Any) -> list[dict[str, Any]]:
    try:
        items = reply["tendencies"]
        if not MIN_TENDENCIES <= len(items) <= MAX_TENDENCIES:
            raise InvalidTendencies(f"{len(items)} tendencies")
        for item in items:
            strength = item["strength"]
            if type(strength) is not int or strength not in STRENGTHS:
                raise InvalidTendencies(f"strength {strength!r}")
            if not MIN_QUOTES <= len(item["quotes"]) <= MAX_QUOTES:
                raise InvalidTendencies(f"{len(item['quotes'])} quotes")
            for field in ("name", "reading"):
                if not isinstance(item[field], str) or not item[field]:
                    raise InvalidTendencies(field)
            for quote in item["quotes"]:
                if not all(
                    isinstance(quote[k], str) and quote[k] for k in ("message_ref", "quote")
                ):
                    raise InvalidTendencies("quote")
    except (KeyError, TypeError) as missing:
        raise InvalidTendencies(f"missing {missing}") from missing
    return items


def validate_tendencies(reply: Any, refs: dict[str, tuple[str, str]]) -> dict[str, Any]:
    """refs: message_ref → (message_id, text). Unfound quotes and quoteless tendencies are dropped."""
    kept, dropped_quotes, dropped_tendencies = [], 0, []
    for item in _check(reply):
        quotes = []
        for quote in item["quotes"]:
            message = refs.get(quote["message_ref"])
            found = None
            if message is not None:
                citation = Citation(message_ref=quote["message_ref"], quote=quote["quote"])
                found = locate_citation(citation, message[0], message[1])
            if found is None:
                dropped_quotes += 1
            else:
                quotes.append(found.model_dump())
        if quotes:
            kept.append({**item, "quotes": quotes})
        else:
            dropped_tendencies.append(item["name"])
    return {
        "tendencies": kept,
        "dropped_quotes": dropped_quotes,
        "dropped_tendencies": dropped_tendencies,
    }
