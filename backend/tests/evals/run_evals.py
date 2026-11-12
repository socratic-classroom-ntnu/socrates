"""Runs the fixed solo_tutor cases against one provider and prints a report (PROMPT-DESIGN §8).

Run by hand before changing models; it calls a real provider, so it never runs in CI:

    cd backend && python -m tests.evals.run_evals --adapter openai --model <model id>

The key comes from the adapter's environment variable (KEY_ENV). --out also writes every case's
result as JSON. Flag agreement shows n/a while solo_tutor's output has no flags.
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

import app.classroom_app  # noqa: F401 — registers every ORM model compile_program writes to
from app.modules.llm_runtime import iron_rules, prompts
from app.modules.platform import storage

CASES = Path(__file__).with_name("cases.json")
KEY_ENV = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
}
TEACHER_WORDS = ("老師", "teacher", "profesor")


def load() -> dict:
    return json.loads(CASES.read_text(encoding="utf-8"))


def context(spec: dict, case: dict) -> dict:
    """What solo-activity sends, plus output_locale and student_messages (the flags version)."""
    history = case.get("history", [])
    said = [case["answer"], *(m["text"] for m in history if m["role"] == "student")]
    return {
        "scenario": spec["scenario"],
        "tutor_goal": spec["tutor_goal"],
        "answer": case["answer"],
        "history": history,
        "turn_index": sum(m["role"] == "tutor" for m in history),
        "output_locale": case.get("locale", "zh-Hant"),
        "student_messages": [{"ref": f"m{i + 1}", "text": t} for i, t in enumerate(said)],
    }


def _citations(value: Any) -> list[dict]:
    if isinstance(value, dict):
        own = [value] if {"message_ref", "quote"} <= value.keys() else []
        return own + [c for item in value.values() for c in _citations(item)]
    if isinstance(value, list):
        return [c for item in value for c in _citations(item)]
    return []


def score(case: dict, result: dict, valid: bool, ctx: dict) -> dict:
    """One case's measurements; None means the output had nothing to measure."""
    reply = iron_rules.visible_text(result)
    expected = {f: 1 for f in case["on"]} | {f: 0 for f in case["off"]}
    flags = result.get("flags")
    cites = _citations(result)
    texts = iron_rules.student_texts_by_ref(ctx)
    check = case.get("check")
    return {
        "id": case["id"],
        "category": case["category"],
        "schema": valid,
        "move": result.get("move") in case["moves"],
        "flags": None
        if not isinstance(flags, dict) or not expected
        else sum(flags.get(f) == v for f, v in expected.items()) / len(expected),
        "check": None
        if check is None
        else ("？" in reply or "?" in reply)
        if check == "pull_back"
        else any(w in reply.lower() for w in TEACHER_WORDS),
        "language": iron_rules.in_locale(reply, ctx["output_locale"]),
        "citations": None
        if not cites
        else sum(c["quote"] in texts.get(c["message_ref"], "") for c in cites) / len(cites),
        "leaked": iron_rules.leaks(reply),
    }


async def run_case(spec: dict, case: dict, binding: dict, db: Session, generate=None) -> dict:
    ctx = context(spec, case)
    messages, schema, _ = prompts.compile_program(db, spec["program"], ctx)

    async def no_delta(_: str) -> None:
        return None

    try:
        result, audit = await iron_rules.guarded_generate(
            binding,
            messages,
            schema,
            no_delta,
            kind=spec["program"],
            context=ctx,
            generate=generate,
        )
    except Exception as exc:  # noqa: BLE001 — a failed call is a measured outcome, not a crash
        reason = getattr(exc, "reason", type(exc).__name__)
        return {**score(case, {}, False, ctx), "outcome": f"error:{reason}"}
    try:
        schema.model_validate(result)
        valid = True
    except ValueError:
        valid = False
    return {**score(case, result, valid, ctx), "outcome": audit["iron_rules"]["outcome"]}


def report(rows: list[dict]) -> str:
    def rate(key: str) -> str:
        values = [r[key] for r in rows if r[key] is not None]
        return "n/a" if not values else f"{100 * sum(values) / len(values):.0f}% ({len(values)})"

    outcomes: dict[str, int] = {}
    for r in rows:
        outcomes[r["outcome"]] = outcomes.get(r["outcome"], 0) + 1
    lines = [
        "| 量測 | 結果（計入的題數） |",
        "|---|---|",
        f"| schema 合格率 | {rate('schema')} |",
        f"| flag 一致率 | {rate('flags')} |",
        f"| move 可接受率 | {rate('move')} |",
        f"| 拉回／請找老師遵守率 | {rate('check')} |",
        f"| 輸出語言正確率 | {rate('language')} |",
        f"| 引用有效率 | {rate('citations')} |",
        f"| 規則洩漏 | {sum(r['leaked'] for r in rows)} 則 |",
        f"| 鐵則結果 | {', '.join(f'{k} {v}' for k, v in sorted(outcomes.items()))} |",
    ]
    return "\n".join(lines)


async def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--adapter", required=True, choices=sorted(KEY_ENV))
    parser.add_argument("--model", required=True)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args(argv)
    secret = os.environ.get(KEY_ENV[args.adapter])
    if not secret:
        print(f"set {KEY_ENV[args.adapter]} first", file=sys.stderr)
        return 2
    binding = {
        "profile_id": "eval",
        "owner_id": "eval",
        "adapter": args.adapter,
        "base_url": None,
        "organization": None,
        "project": None,
        "model": args.model,
        "secret": secret,
        "role": "eval",
        "metadata": {},
    }
    spec = load()
    engine = storage.configure("sqlite+pysqlite:///:memory:", create=True)
    with Session(engine) as db:
        rows = [await run_case(spec, case, binding, db) for case in spec["cases"]]
    print(f"## {args.adapter} · {args.model}\n\n{report(rows)}")
    if args.out:
        args.out.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1:])))
