"""Every number the report gives, from runs/ into report/numbers.json. No database, no provider.

python analyze.py
"""

from __future__ import annotations

import json
import statistics
from pathlib import Path

from metrics import (
    axis_name_changes,
    duplicate_pairs,
    is_flat,
    pearson,
    score_spread,
    spread,
    stdev,
)

HERE = Path(__file__).resolve().parent
RUNS = HERE / "runs"
OUT = HERE / "report" / "numbers.json"
LOOSE_FLAT = 1.5


def _read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def scores_of(view: dict) -> dict[str, list[float]]:
    return {s["display_name"]: [x["score"] for x in s["scores"]] for s in view["students"]}


def run_numbers(run: dict) -> dict:
    view = run["view"]
    names = [d["name"] for d in view["dimensions"]]
    by_student = scores_of(view)
    by_axis = [[scores[k] for scores in by_student.values()] for k in range(len(names))]
    matrix = [[pearson(a, b) for b in by_axis] for a in by_axis]
    cells = [x for s in view["students"] for x in s["scores"]]
    models = sorted({c["actual_model"] for c in run["calls"] if c["actual_model"]})
    return {
        "count": run["count"],
        "sources": run["sources"],
        "models": models,
        "calls": len(run["calls"]),
        "failed_calls": [c for c in run["calls"] if c["state"] != "READY"],
        "cost": round(sum((c["token_usage"] or {}).get("cost") or 0 for c in run["calls"]), 5),
        "seconds": run["seconds"],
        "left_out": run["left_out"],
        "dimensions": view["dimensions"],
        "correlation": [[None if r is None else round(r, 2) for r in row] for row in matrix],
        "duplicates": [
            {"axes": [names[a], names[b]], "r": round(r, 2)} for a, b, r in duplicate_pairs(by_axis)
        ],
        "students": {
            name: {
                "scores": scores,
                "spread": spread(scores),
                "stdev": round(stdev(scores), 2),
                "flat": is_flat(scores),
                "flat_loose": is_flat(scores, LOOSE_FLAT),
            }
            for name, scores in by_student.items()
        },
        "flat": [n for n, s in by_student.items() if is_flat(s)],
        "flat_loose": [n for n, s in by_student.items() if is_flat(s, LOOSE_FLAT)],
        "score_counts": {
            str(v): sum(1 for s in by_student.values() for x in s if x == v) for v in range(5)
        },
        "cells": len(cells),
        "cells_without_quote": sum(1 for x in cells if not x["sources"]),
        "quotes": sum(len(x["sources"]) for x in cells),
    }


def stability(runs: list[dict]) -> dict:
    """Between repeated runs on the same data: names by index, and scores by index."""
    names = [[d["name"] for d in r["view"]["dimensions"]] for r in runs]
    by_index = [sorted({n[k] for n in names}) for k in range(len(names[0]))]
    spread_by = score_spread([scores_of(r["view"]) for r in runs])
    values = [x for row in spread_by.values() for x in row]
    return {
        "names": names,
        "same_names_all_runs": all(n == names[0] for n in names),
        "names_by_index": by_index,
        "index_kept_name": [len(v) == 1 for v in by_index],
        "changes": [axis_name_changes(names[0], other) for other in names[1:]],
        "score_spread": {
            "mean": round(statistics.mean(values), 2),
            "max": max(values),
            "cells": len(values),
            "changed": sum(v > 0 for v in values),
            "at_least_2": sum(v >= 2 for v in values),
        },
        "by_student": spread_by,
    }


def growing(runs: list[dict]) -> list[dict]:
    """What the teacher sees change as one more student finishes."""
    steps = []
    for before, after in zip(runs, runs[1:]):
        old, new = scores_of(before["view"]), scores_of(after["view"])
        moved = [abs(a - b) for n in old for a, b in zip(old[n], new[n])]
        steps.append(
            {
                "from": before["count"],
                "to": after["count"],
                "routes": [before["sources"], after["sources"]],
                "names": axis_name_changes(
                    [d["name"] for d in before["view"]["dimensions"]],
                    [d["name"] for d in after["view"]["dimensions"]],
                ),
                "same_students_moved": {
                    "mean": round(statistics.mean(moved), 2),
                    "max": max(moved),
                    "changed": sum(m > 0 for m in moved),
                    "cells": len(moved),
                },
            }
        )
    return steps


def tendencies() -> dict:
    runs = {p.stem: _read(p) for p in sorted((RUNS / "tendencies").glob("*.json"))}
    names = sorted({n for r in runs.values() for n in r["students"]})
    found = {}
    for name in names:
        entries = {label: r["students"][name] for label, r in runs.items()}
        found[name] = {
            label: (
                {"error": e["error"]}
                if "error" in e
                else {
                    "tendencies": [(t["name"], t["strength"]) for t in e["tendencies"]],
                    "dropped_quotes": e["dropped_quotes"],
                    "dropped_tendencies": e["dropped_tendencies"],
                }
            )
            for label, e in entries.items()
        }
    ok = [e for r in runs.values() for e in r["students"].values() if "error" not in e]
    return {
        "runs": list(runs),
        "model": sorted({r["model"] for r in runs.values()}),
        "errors": [
            {"run": label, "student": n, "error": e["error"]}
            for label, r in runs.items()
            for n, e in r["students"].items()
            if "error" in e
        ],
        "kept_quotes": sum(len(t["quotes"]) for e in ok for t in e["tendencies"]),
        "dropped_quotes": sum(e["dropped_quotes"] for e in ok),
        "dropped_tendencies": sum(len(e["dropped_tendencies"]) for e in ok),
        "tendency_count": {
            str(k): sum(1 for e in ok if len(e["tendencies"]) == k) for k in range(3, 6)
        },
        "cost": round(
            sum(
                (e.get("usage") or {}).get("cost") or 0
                for r in runs.values()
                for e in r["students"].values()
            ),
            5,
        ),
        "students": found,
    }


def main() -> None:
    before = {p.stem: _read(p) for p in sorted((RUNS / "before").glob("*.json"))}
    grow = [_read(RUNS / "growing" / f"n{n}-1.json") for n in (14, 15, 16)]
    groups = {
        size: [before[f"n{size}-{i}"] for i in (1, 2, 3) if f"n{size}-{i}" in before]
        for size in (14, 16)
    }
    numbers = {
        "embedding_probe": _read(RUNS / "embedding-probe.json"),
        "runs": {f"before/{k}": run_numbers(v) for k, v in before.items()}
        | {f"growing/n{r['count']}-1": run_numbers(r) for r in grow},
        "stability": {str(size): stability(runs) for size, runs in groups.items() if runs},
        "growing": growing(grow),
        "tendencies": tendencies(),
    }
    after = sorted((RUNS / "after").glob("*.json")) if (RUNS / "after").exists() else []
    if after:
        runs = [_read(p) for p in after]
        numbers["runs"] |= {f"after/{p.stem}": run_numbers(r) for p, r in zip(after, runs)}
        numbers["stability"]["after-14"] = stability(runs)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(numbers, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    for key, r in numbers["runs"].items():
        print(
            f"{key:18} {r['sources']} flat {len(r['flat'])}/{r['count']} "
            f"dup {len(r['duplicates'])} no-quote {r['cells_without_quote']}/{r['cells']} "
            f"${r['cost']}"
        )
    for size, s in numbers["stability"].items():
        print(
            size,
            "same names:",
            s["same_names_all_runs"],
            "kept by index:",
            s["index_kept_name"],
            s["score_spread"],
        )
    for step in numbers["growing"]:
        print(step["from"], "→", step["to"], step["names"], step["same_students_moved"])
    t = numbers["tendencies"]
    print(
        "B:",
        t["tendency_count"],
        "kept",
        t["kept_quotes"],
        "dropped",
        t["dropped_quotes"],
        t["errors"],
    )


if __name__ == "__main__":
    main()
