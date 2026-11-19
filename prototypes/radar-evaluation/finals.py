"""Each student's final summary, written once by the app's final_summary and kept as JSON.

generate: for each student still in the review, the app's own steps — machine.start_final, then
service._prepare_final (the material: each scenario's text with the confirmed summary, and all the
student's words as m1, m2, …), then service._finish_final (the call, quotes located, the summary
shown) — and the student answers 對 (submit_reflection). One call per student, no retries: a student
whose call failed stays in the review, and running generate again tries only those.

load N: the first N students of students.py completed with their kept summary from the JSON, every
other student back in the review without one, so the radar counts exactly those N.

Quotes are stored by message ref (m1, m2, …), not message id, so the JSON loads into any database
seeded by seed.py.

    python finals.py generate --limit 1   # one student first, to check the whole path
    python finals.py generate
    python finals.py load 14
"""

from __future__ import annotations

import argparse
import asyncio
import time
from dataclasses import asdict

from lab import CLASS_FILE, FINALS_FILE, read_json, write_json
from app.modules.identity_access.repositories import Account
from app.modules.platform import storage
from app.modules.solo_activity import attempt_machine as machine
from app.modules.solo_activity import service
from app.modules.solo_activity.repositories import SoloAttempt


def _refs(db, attempt_id: str) -> dict[str, str]:
    """message id → ref, numbered as _prepare_final and begin_radar number them."""
    said = [m for m in service._messages(db, attempt_id) if m.role == "student"]
    return {m.id: f"m{number}" for number, m in enumerate(said, start=1)}


def _swap_sources(summary: dict, swap) -> dict:
    """The summary with each quote's message pointer passed through swap."""
    out = {**summary}
    for part in ("points", "trajectory"):
        out[part] = [
            {**item, "sources": [swap(s) for s in item["sources"]]} for item in summary[part]
        ]
    return out


def _to_refs(summary: dict, refs: dict[str, str]) -> dict:
    def swap(source: dict) -> dict:
        rest = {k: v for k, v in source.items() if k != "message_id"}
        return {"message_ref": refs[source["message_id"]], **rest}

    return _swap_sources(summary, swap)


def _to_ids(summary: dict, refs: dict[str, str]) -> dict:
    ids = {ref: message_id for message_id, ref in refs.items()}

    def swap(source: dict) -> dict:
        rest = {k: v for k, v in source.items() if k != "message_ref"}
        return {"message_id": ids[source["message_ref"]], **rest}

    return _swap_sources(summary, swap)


async def _generate_one(attempt_id: str) -> tuple[dict | None, str]:
    """(summary with refs, model) or (None, reason)."""
    at = time.time()
    with storage.transaction() as db:
        row = db.get(SoloAttempt, attempt_id, with_for_update=True)
        if row.state != "reviewing":
            return None, f"attempt is {row.state}, not in the review"
        account = db.get(Account, row.account_id)
        waiting, pending = machine.start_final(service._state(row), at)
        prepared = service._prepare_final(db, row, waiting, pending, account, at)
    if "view" in prepared:
        raise SystemExit("the teacher has no AI settings: run configure_ai.py first")
    model = prepared["bindings"][0]["model"]
    await service._finish_final(prepared)
    with storage.transaction() as db:
        row = db.get(SoloAttempt, attempt_id, with_for_update=True)
        a = service._state(row)
        if a.state != "reflecting":
            return None, f"final_summary failed ({a.notice})"
        service._store(row, machine.submit_reflection(a, a.final.digest))
        return _to_refs(row.final["summary"], _refs(db, attempt_id)), model


async def generate(limit: int | None = None) -> None:
    students = read_json(CLASS_FILE)["students"]
    kept = read_json(FINALS_FILE) if FINALS_FILE.exists() else {"students": {}}
    failed = []
    todo = [s for s in students if s["name"] not in kept["students"]]
    for student in todo[:limit]:
        summary, detail = await _generate_one(student["attempt_id"])
        if summary is None:
            failed.append(f"{student['name']}: {detail}")
            print(f"✗ {student['name']}: {detail}")
            continue
        kept["students"][student["name"]] = {"model": detail, "summary": summary}
        write_json(FINALS_FILE, kept)
        print(f"✓ {student['name']}: {summary['final_position']}")
    print(f"{len(kept['students'])}/{len(students)} kept in {FINALS_FILE}")
    if failed:
        raise SystemExit("not written: " + "; ".join(failed) + " — run generate again for these")


def load(count: int) -> list[str]:
    """The names now counted by the radar, in joining order."""
    students = read_json(CLASS_FILE)["students"]
    kept = read_json(FINALS_FILE)["students"]
    counted = []
    with storage.transaction() as db:
        for number, student in enumerate(students):
            row = db.get(SoloAttempt, student["attempt_id"], with_for_update=True)
            row.pending_key = row.pending_since = row.notice = None
            if number < count:
                summary = _to_ids(kept[student["name"]]["summary"], _refs(db, row.id))
                row.final = {**asdict(machine.FinalProgress()), "summary": summary}
                row.final["status"] = "confirmed"
                row.state = "completed"
                counted.append(student["name"])
            else:
                row.final = asdict(machine.FinalProgress())
                row.state = "reviewing"
    return counted


def main() -> None:
    parser = argparse.ArgumentParser()
    step = parser.add_subparsers(dest="step", required=True)
    generating = step.add_parser("generate")
    generating.add_argument("--limit", type=int, help="write at most this many this time")
    loading = step.add_parser("load")
    loading.add_argument("count", type=int)
    args = parser.parse_args()
    if args.step == "generate":
        asyncio.run(generate(args.limit))
    else:
        print(", ".join(load(args.count)))


if __name__ == "__main__":
    main()
