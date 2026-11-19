"""Can the vectors alone find three axes? The vector route's first half, without the naming call.

The kept summaries' normalized_text through the app's embed and principal_axes, as radar.py's
_vector_route does: each component's share of the variance, and how many pass MIN_AXIS_SHARE (the
route needs MIN_AXES of them, or it falls back to the scoring route). No provider call.

    python probe_embedding.py 14 15 16
"""

from __future__ import annotations

import argparse

from lab import CLASS_FILE, FINALS_FILE, RUNS, read_json, write_json
from app.modules.ai_providers.service import embed
from app.modules.solo_activity import radar

SHOWN = 8


def probe(count: int) -> dict:
    names = [s["name"] for s in read_json(CLASS_FILE)["students"]][:count]
    kept = read_json(FINALS_FILE)["students"]
    vectors = embed([kept[name]["summary"]["normalized_text"] for name in names])
    width = len(vectors[0])
    mean = [sum(v[j] for v in vectors) / count for j in range(width)]
    total = sum(sum((v[j] - mean[j]) ** 2 for j in range(width)) for v in vectors)
    components = radar.principal_axes(vectors, min(SHOWN, count - 1))
    shares = [round(sum(x * x for x in axis) / total, 4) for axis in components]
    passing = sum(share >= radar.MIN_AXIS_SHARE for share in shares)
    return {
        "count": count,
        "shares": shares,
        "passing": passing,
        "min_share": radar.MIN_AXIS_SHARE,
        "min_axes": radar.MIN_AXES,
        "route_takes_vectors": count >= radar.EMBEDDING_MIN_STUDENTS and passing >= radar.MIN_AXES,
        "axes": {
            name: [round(axis[i], 4) for axis in components[:passing]]
            for i, name in enumerate(names)
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("counts", type=int, nargs="+")
    args = parser.parse_args()
    found = [probe(count) for count in args.counts]
    write_json(RUNS / "embedding-probe.json", found)
    for item in found:
        shares = ", ".join(f"{share:.0%}" for share in item["shares"])
        print(
            f"{item['count']} students: {item['passing']} axes ≥ {item['min_share']:.0%} "
            f"(needs {item['min_axes']}) — {shares}"
        )


if __name__ == "__main__":
    main()
