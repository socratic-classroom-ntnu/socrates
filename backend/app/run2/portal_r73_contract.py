"""R73 pure decision helpers. Timers and option groups keep native authority."""

from copy import deepcopy
import random

PUBLIC_NODE_SCOPES = frozenset({"stage", "group_shared"})


def visible_evidence(nodes, edges, member_id, teacher):
    visible = [
        deepcopy(n)
        for n in nodes
        if teacher or n.get("member_id") == member_id or n.get("visibility") in PUBLIC_NODE_SCOPES
    ]
    known = {n["id"] for n in visible}
    return visible, [deepcopy(e) for e in edges if e["source"] in known and e["target"] in known]


def representatives(options, answers, members, rng=None):
    """One selected member per populated option; simultaneous choices stay grouped."""
    rng = rng or random.SystemRandom()
    selected = []
    for option in options:
        ids = sorted(
            mid
            for mid, a in answers.items()
            if mid in members and a.get("option_id") == option["id"]
        )
        if ids:
            selected.append({"option_id": option["id"], "member_id": rng.choice(ids)})
    return selected


def remaining_seconds(deadline, server_now):
    return max(0.0, float(deadline) - float(server_now))
