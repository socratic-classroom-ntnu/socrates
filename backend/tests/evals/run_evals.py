"""Runs the fixed solo_tutor cases against one provider and prints a report (PROMPT-DESIGN §8).

Run by hand before changing models; it calls a real provider, so it never runs in CI:

    cd backend && python -m tests.evals.run_evals --adapter openai --model <model id>

The key comes from the adapter's environment variable (KEY_ENV). --out also writes every case's
result as JSON. Flag agreement shows n/a while solo_tutor's output has no flags. The cases and the
scorer live in app.modules.llm_runtime.evals, which the 後台 report scores QA's typed runs with.
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

from sqlalchemy.orm import Session

import app.classroom_app  # noqa: F401 — registers every ORM model compile_program writes to
from app.modules.llm_runtime import iron_rules, prompts
from app.modules.llm_runtime.evals import context, load, rate, score
from app.modules.platform import storage

__all__ = ["context", "load", "report", "run_case", "score"]

KEY_ENV = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
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
    def shown(key: str) -> str:
        value, count = rate(rows, key)
        return "n/a" if value is None else f"{100 * value:.0f}% ({count})"

    outcomes: dict[str, int] = {}
    for r in rows:
        outcomes[r["outcome"]] = outcomes.get(r["outcome"], 0) + 1
    lines = [
        "| 量測 | 結果（計入的題數） |",
        "|---|---|",
        f"| schema 合格率 | {shown('schema')} |",
        f"| flag 一致率 | {shown('flags')} |",
        f"| move 可接受率 | {shown('move')} |",
        f"| 拉回／請找老師遵守率 | {shown('check')} |",
        f"| 輸出語言正確率 | {shown('language')} |",
        f"| 引用有效率 | {shown('citations')} |",
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
