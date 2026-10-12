"""Evidence projections. Identity reveal is provided by a separate teacher endpoint."""

from hashlib import sha256
from copy import deepcopy


def pseudonym(classroom_id, member_id):
    return "p-" + sha256((classroom_id + ":" + member_id).encode()).hexdigest()[:12]


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
