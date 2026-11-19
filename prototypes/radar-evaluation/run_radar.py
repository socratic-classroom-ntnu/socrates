"""Read the real radar as the teacher, for a number of students, as many times as asked.

Each run: the first N students loaded from the JSON (finals.load), the kept radar for the activity
deleted so it is computed again (unless --keep), then GET /api/v2/solo/activities/{id}/radar.
Saved per run in runs/<label>/n<N>-<run>.json: the view, which students were loaded and which
the view left out, and the provider calls made meanwhile (model, cost, why one failed).

    python run_radar.py before 14 --runs 3     # the scoring route, three times
    python run_radar.py before 16 --runs 3     # the vector route
    python run_radar.py growing 14 15 16 --keep  # what the teacher sees as students finish
"""

from __future__ import annotations

import argparse
import time

from sqlalchemy import select

from finals import load
from lab import CLASS_FILE, RUNS, TEACHER, Api, read_json, write_json
from app.modules.ai_providers.repositories import CallAudit
from app.modules.platform import storage
from app.modules.solo_activity.repositories import SoloRadar


def _calls_since(at: float) -> list[dict]:
    with storage.transaction() as db:
        rows = db.scalars(
            select(CallAudit).where(CallAudit.created_at >= at).order_by(CallAudit.created_at)
        )
        return [
            {
                key: row.metadata_json.get(key)
                for key in (
                    "endpoint",
                    "state",
                    "reason_code",
                    "requested_model",
                    "actual_model",
                    "latency_ms",
                    "token_usage",
                    "estimated_cost",
                )
            }
            for row in rows
        ]


def run_once(activity_id: str, count: int, keep: bool) -> dict:
    loaded = load(count)
    if not keep:
        with storage.transaction() as db:
            row = db.get(SoloRadar, activity_id)
            if row is not None:
                db.delete(row)
    teacher = Api().login(TEACHER)
    started = time.time()
    view = teacher.get(f"/api/v2/solo/activities/{activity_id}/radar")
    elapsed = time.time() - started
    shown = [s["display_name"] for s in view["students"]]
    return {
        "count": count,
        "reset": not keep,
        "at": started,
        "seconds": round(elapsed, 1),
        "sources": sorted({d["source"] for d in view["dimensions"]}),
        "loaded": loaded,
        "left_out": [name for name in loaded if name not in shown],
        "calls": _calls_since(started),
        "view": view,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("label", help="folder under runs/, e.g. before or after")
    parser.add_argument(
        "counts", type=int, nargs="+", help="students counted, in students.py order"
    )
    parser.add_argument("--runs", type=int, default=1)
    parser.add_argument("--keep", action="store_true", help="do not delete the kept radar first")
    args = parser.parse_args()
    activity_id = read_json(CLASS_FILE)["activity_id"]
    for count in args.counts:
        for number in range(1, args.runs + 1):
            result = run_once(activity_id, count, args.keep)
            path = RUNS / args.label / f"n{count}-{number}.json"
            write_json(path, {"label": args.label, "run": number, **result})
            names = " / ".join(d["name"] for d in result["view"]["dimensions"])
            cost = sum((c["token_usage"] or {}).get("cost") or 0 for c in result["calls"])
            print(
                f"{path.name}: {result['sources']} {len(result['view']['students'])} students, "
                f"left out {result['left_out'] or 'none'}, {len(result['calls'])} calls "
                f"(~${cost:.4f}), {result['seconds']}s — {names}"
            )


if __name__ == "__main__":
    main()
