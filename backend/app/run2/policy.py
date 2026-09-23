"""Pure classroom policies. Persistence and LLM calls belong to adapters."""

import random
from .contracts import Observations


def stage_goal(observations: dict, completed_turns: int) -> bool:
    o = Observations.model_validate(observations)
    return (
        completed_turns >= 1
        and not o.position_shifted
        and o.has_position
        and o.has_reason
        and o.reason_tested
    )


def choose_representative(
    option_id: str, answers: dict, members: dict, excluded: set[str], now: float, rng=None
) -> str | None:
    pool = [
        m
        for m, a in answers.items()
        if a.get("option_id") == option_id
        and a.get("argument", "").strip()
        and m not in excluded
        and now - members[m].get("last_seen", 0) <= 30
    ]
    if not pool:
        return None
    minimum = min(members[m].get("selected_count", 0) for m in pool)
    return (rng or random.SystemRandom()).choice(
        [m for m in pool if members[m].get("selected_count", 0) == minimum]
    )


def distribution(
    question: dict, answers: dict, members: dict, identities: bool = True
) -> list[dict]:
    total = len(answers)
    result = []
    for o in question["options"]:
        ids = [m for m, a in answers.items() if a["option_id"] == o["id"]]
        row = {
            "option_id": o["id"],
            "text": o["text"],
            "count": len(ids),
            "percent": 100 * len(ids) / total if total else 0,
        }
        if identities:
            row["members"] = [
                {"alias": members[m]["alias"], "avatar": members[m]["avatar"]} for m in ids
            ]
        result.append(row)
    return result


def majority_context(question: dict, answers: dict, focuses: list[dict]) -> dict:
    counts = {
        o["id"]: sum(a["option_id"] == o["id"] for a in answers.values())
        for o in question["options"]
    }
    high = max(counts.values(), default=0)
    majority = sorted(k for k, v in counts.items() if high and v == high)
    return {
        "question": question,
        "majority_options": majority,
        "counts": counts,
        "representatives": [
            {
                "option_id": f["option_id"],
                "argument": f["argument"],
                "discussion": f["messages"],
                "micro_summary": f.get("micro_summary", ""),
            }
            for f in focuses
            if f["option_id"] in majority
        ],
    }
