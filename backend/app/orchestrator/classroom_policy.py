"""Pure classroom policies. Persistence and LLM calls belong to adapters."""

import random

from app.domain.tutor import Observations as DomainObservations
from app.orchestrator import policy as round1

from app.api.classroom_schemas import Observations


def stage_goal(observations: dict, completed_turns: int) -> bool:
    """Advance criteria live once, in Round 1's policy (AGENTS.md non-negotiable).

    Round 1's turn_count (exchanges completed before this one) and Run 2's completed_turns
    (index of the exchange just answered) have the same value at the same moment.
    """
    o = Observations.model_validate(observations)
    return round1.should_advance(DomainObservations.model_validate(o.model_dump()), completed_turns)


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
