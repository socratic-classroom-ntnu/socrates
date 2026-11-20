"""Prototype B: each student's own 3–5 tendencies, straight from the model, not an app program.

For each student: the scenarios, their own words numbered m1, m2, … over both scenarios (as
radar.begin_radar numbers them) and their kept final summary as the model reads one back
(service._for_model), with prompts/tendencies.md. Called through OpenRouter with the request the
app's gateway sends (strict JSON schema, the same output and reasoning budgets). One call per
student per run, no retries; a failed or invalid reply is recorded as such. Quotes are checked
with locate_citation (tendencies.validate_tendencies).

    python run_tendencies.py 1
"""

from __future__ import annotations

import argparse
import hashlib
import json
import time

import httpx
from pydantic import BaseModel

from lab import FINALS_FILE, HERE, MODEL, RUNS, read_json, read_key, write_json
from app.modules.ai_providers.provider_schema import openai_response_schema
from app.modules.solo_activity import service
from students import STUDENTS
from tendencies import InvalidTendencies, number_messages, validate_tendencies

PROMPT = HERE / "prompts" / "tendencies.md"
URL = "https://openrouter.ai/api/v1/chat/completions"
# The gateway's defaults (CLASSROOM_MAX_OUTPUT_TOKENS, CLASSROOM_REASONING_MAX_TOKENS).
OUTPUT_BUDGET, REASONING_BUDGET = 2048, 1024


class Quote(BaseModel):
    message_ref: str
    quote: str


class Tendency(BaseModel):
    name: str
    strength: int
    reading: str
    quotes: list[Quote]


class Tendencies(BaseModel):
    tendencies: list[Tendency]


def _context(student: dict, summary: dict) -> tuple[dict, dict[str, tuple[str, str]]]:
    refs = number_messages([said for _, said, _ in student["scenarios"]])
    context = {
        "scenarios": [text for text, _, _ in student["scenarios"]],
        "student_messages": [{"ref": ref, "text": text} for ref, text in refs],
        "final_summary": service._for_model(summary),
    }
    # No database here: the ref stands in for the message id in each located quote.
    return context, {ref: (ref, text) for ref, text in refs}


def _ask(http: httpx.Client, key: str, prompt: str, context: dict) -> tuple[dict, dict]:
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": json.dumps(context, ensure_ascii=False)},
        ],
        "stream": False,
        "max_tokens": OUTPUT_BUDGET + REASONING_BUDGET,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": Tendencies.__name__,
                "strict": True,
                "schema": openai_response_schema(Tendencies),
            },
        },
        "provider": {"require_parameters": True},
        "reasoning": {"exclude": True, "max_tokens": REASONING_BUDGET},
    }
    response = http.post(URL, json=payload, headers={"authorization": f"Bearer {key}"})
    response.raise_for_status()
    body = response.json()
    return json.loads(body["choices"][0]["message"]["content"]), {
        "actual_model": body.get("model"),
        "usage": body.get("usage", {}),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("label", help="run name, e.g. 1")
    args = parser.parse_args()
    key = read_key()
    prompt = PROMPT.read_text(encoding="utf-8")
    kept = read_json(FINALS_FILE)["students"]
    found = {}
    with httpx.Client(timeout=120) as http:
        for student in STUDENTS:
            name = student["name"]
            context, refs = _context(student, kept[name]["summary"])
            started = time.time()
            entry: dict = {}
            try:
                reply, meta = _ask(http, key, prompt, context)
                entry = {"reply": reply, **meta}
                entry.update(validate_tendencies(reply, refs))
            except (httpx.HTTPError, KeyError, json.JSONDecodeError, InvalidTendencies) as error:
                entry["error"] = f"{type(error).__name__}: {error}"
            entry["seconds"] = round(time.time() - started, 1)
            found[name] = entry
            shown = entry.get("error") or " / ".join(
                f"{t['name']}({t['strength']})" for t in entry["tendencies"]
            )
            print(f"{name}: {shown}")
    write_json(
        RUNS / "tendencies" / f"{args.label}.json",
        {
            "label": args.label,
            "model": MODEL,
            "prompt_sha256": hashlib.sha256(prompt.encode()).hexdigest(),
            "students": found,
        },
    )


if __name__ == "__main__":
    main()
