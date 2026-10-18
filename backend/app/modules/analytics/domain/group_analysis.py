"""Evidence projections. Identity reveal is provided by a separate teacher endpoint."""

from hashlib import sha256
from copy import deepcopy

from app.modules.group_dialogue.domain.group_run import PERSONAL_STATUSES, baseline_answers
from app.modules.classroom_core.orchestrator.classroom_policy import distribution

# Why a member has no confirmed baseline yet: their personal status, or not_answered.
UNCONFIRMED_KEYS = (*(s for s in PERSONAL_STATUSES if s != "confirmed"), "not_answered")


def pseudonym(classroom_id, member_id):
    return "p-" + sha256((classroom_id + ":" + member_id).encode()).hexdigest()[:12]


def stance_distribution(state):
    """Teacher-only: per question run, the group's stance distribution (issue #15).

    Counts come from confirmed personal baselines only, like the group's own distribution and
    representative choice (`baseline_answers`); rows carry no identities. Members without a
    baseline are counted apart by their personal status (`not_answered` when they never answered).
    """
    members = state["group"]["member_snapshot"]
    result = []
    for index, run in enumerate(state.get("runs", [])):
        if index >= len(state.get("questions", [])):
            break
        question = state["questions"][index]
        baselines = {m: a for m, a in baseline_answers(run).items() if m in members}
        rows = distribution(question, baselines, state["members"], identities=False)
        unconfirmed = dict.fromkeys(UNCONFIRMED_KEYS, 0)
        personal = run.get("personal", {})
        for m in members:
            if m in baselines:
                continue
            entry = personal.get(m)
            unconfirmed[entry["status"] if entry else "not_answered"] += 1
        result.append(
            {
                "question_index": index,
                "question_id": question["id"],
                "question_title": question["title"],
                "run_id": run["id"],
                "run_phase": run["phase"],
                "basis": "personal_baseline",
                "members": len(members),
                "confirmed": len(baselines),
                "unconfirmed": len(members) - len(baselines),
                "unconfirmed_by_status": unconfirmed,
                "options": rows,
                # Two or more options held: representative discussion will set them side by side.
                "differing": sum(1 for row in rows if row["count"]) >= 2,
            }
        )
    return result


def current_stance(state):
    """The stance distribution of the group's current question run; None before it starts."""
    rows = stance_distribution(state)
    index = state.get("question_index", -1)
    return rows[index] if 0 <= index < len(rows) else None


def analysis(classroom_id, title, rooms):
    groups = []
    for room in rooms:
        s = room.state if hasattr(room, "state") else room
        p = s["group"]
        persons = []
        midmap = {m: pseudonym(classroom_id, m) for m in p["member_snapshot"]}
        nodes = [
            {
                **{k: v for k, v in n.items() if k != "member_id"},
                "person_id": midmap[n["member_id"]],
                "nickname": s["members"][n["member_id"]]["alias"],
            }
            for n in p["arguments"]
        ]
        for m in p["member_snapshot"]:
            ack = p["confirmations"].get(m)
            quoted = [n for n in nodes if n["person_id"] == midmap[m]]
            persons.append(
                {
                    "id": midmap[m],
                    "nickname": s["members"][m]["alias"],
                    "confirmed": bool(ack),
                    "confirmation_digest": ack["summary_digest"] if ack else None,
                    "timeline": quoted,
                }
            )
        edges = deepcopy(p["edges"])
        roots = {n["id"] for n in nodes} - {e["target"] for e in edges}
        primary_parent: dict = {}
        for e in edges:
            primary_parent.setdefault(e["target"], e["source"])
        # Secondary edges remain explicit references in the readable tree.
        projection = [
            {
                "id": n["id"],
                "parent": primary_parent.get(n["id"]),
                "cross_references": [
                    e
                    for e in edges
                    if e["target"] == n["id"] and e["source"] != primary_parent.get(n["id"])
                ],
            }
            for n in nodes
        ]
        groups.append(
            {
                "id": p["id"],
                "label": p["label"],
                "phase": s["phase"],
                "snapshot_id": p["snapshot_id"],
                "settlement": deepcopy(p["settlement"]),
                "persons": persons,
                "nodes": nodes,
                "edges": edges,
                "tree_projection": projection,
                "roots": sorted(roots),
                "stances": stance_distribution(s),
            }
        )
    return {
        "schema": "socrates/group-analysis/v1",
        "classroom_id": classroom_id,
        "title": title,
        "groups": groups,
        "basis": "attributed_original_quotes",
        "identity": "nickname_and_classroom_scoped_pseudonym",
        "chart_semantics": {
            "sunburst": "class_group_person_confirmation",
            "sankey": "observed_stage_transitions_with_quote_references",
            "graph": "student_explicit_relations",
            "heatmap": "confirmation_and_settlement",
            "timeline": "quoted_viewpoint_history",
        },
    }
