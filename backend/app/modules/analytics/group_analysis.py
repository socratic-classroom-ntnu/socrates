"""Evidence projections. Identity reveal is provided by a separate teacher endpoint."""

from hashlib import sha256
from copy import deepcopy

from app.modules.group_dialogue.service import stance_distribution
from app.modules.solo_activity.metrics import student_metrics


def pseudonym(classroom_id, member_id):
    return "p-" + sha256((classroom_id + ":" + member_id).encode()).hexdigest()[:12]


def pseudonymous_settlement(settlement, midmap):
    out = deepcopy(settlement)
    if "incomplete_members" in out:
        out["incomplete_members"] = [midmap[m] for m in out["incomplete_members"]]
    if "member_status" in out:
        out["member_status"] = {midmap[m]: v for m, v in out["member_status"].items()}
    return out


def person_metrics(state, member_id):
    """The same metrics and marks as the solo activity (solo_activity/metrics.py), from the flags
    the personal tutor gave this member's messages over every question of the class.

    The personal dialogue stays private to the student, so no message ids leave here: the lists
    that name the messages behind a metric or a mark are empty.
    """
    judged, shifts, tested = [], 0, False
    for run_index, run in enumerate(state.get("runs") or []):
        messages = ((run.get("personal") or {}).get(member_id) or {}).get("messages") or []
        last_student = None
        for index, message in enumerate(messages):
            if message.get("role") == "student":
                last_student = index
                continue
            observations = message.get("observations") or {}
            shifts += bool(observations.get("position_shifted"))
            tested = tested or bool(observations.get("reason_tested"))
            if message.get("flags") and last_student is not None:
                judged.append(
                    {"message_id": f"q{run_index}.m{last_student}", "flags": message["flags"]}
                )
    out = student_metrics(judged, position_shifts=shifts, reason_tested=tested)
    if out["metrics"] is not None:
        for name in ("engagement", "distraction", "depth", "initiative"):
            out["metrics"][name]["message_ids"] = []
    out["mark_message_ids"] = []
    return out


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
                    **person_metrics(s, m),
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
                "settlement": pseudonymous_settlement(p["settlement"], midmap),
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
