"""The numbers the report answers with: flat students, repeated axes, stability between runs."""

from __future__ import annotations

import math

FLAT_SPREAD = 1.0
DUPLICATE_CORRELATION = 0.7


def spread(scores: list[float]) -> float:
    return max(scores) - min(scores)


def is_flat(scores: list[float], threshold: float = FLAT_SPREAD) -> bool:
    return spread(scores) <= threshold


def stdev(scores: list[float]) -> float:
    mean = sum(scores) / len(scores)
    return math.sqrt(sum((s - mean) ** 2 for s in scores) / len(scores))


def pearson(a: list[float], b: list[float]) -> float | None:
    """None when either axis gives every student the same score."""
    if len(a) != len(b):
        raise ValueError("both axes must score the same students")
    mean_a, mean_b = sum(a) / len(a), sum(b) / len(b)
    da = [x - mean_a for x in a]
    db = [y - mean_b for y in b]
    size = math.sqrt(sum(x * x for x in da) * sum(y * y for y in db))
    if size == 0:
        return None
    return sum(x * y for x, y in zip(da, db, strict=True)) / size


def duplicate_pairs(
    by_axis: list[list[float]], threshold: float = DUPLICATE_CORRELATION
) -> list[tuple[int, int, float]]:
    """(axis, axis, r) for each pair whose scores over the class correlate at r >= threshold."""
    pairs = []
    for i in range(len(by_axis)):
        for j in range(i + 1, len(by_axis)):
            r = pearson(by_axis[i], by_axis[j])
            if r is not None and r >= threshold:
                pairs.append((i, j, r))
    return pairs


def axis_name_changes(before: list[str], after: list[str]) -> dict[str, list[str]]:
    return {
        "same": [name for name in before if name in after],
        "only_before": [name for name in before if name not in after],
        "only_after": [name for name in after if name not in before],
    }


def score_spread(runs: list[dict[str, list[float]]]) -> dict[str, list[float]]:
    """Per student, per axis index: highest minus lowest score over the runs that scored them."""
    widths = {len(scores) for run in runs for scores in run.values()}
    if len(widths) > 1:
        raise ValueError("runs have a different number of axes")
    names = [name for name in runs[0]]
    names += [name for run in runs[1:] for name in run if name not in names]
    found = {}
    for name in names:
        seen = [run[name] for run in runs if name in run]
        found[name] = [spread([scores[k] for scores in seen]) for k in range(len(seen[0]))]
    return found
