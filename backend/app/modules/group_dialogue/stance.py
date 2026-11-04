from app.modules.group_dialogue.group_run import PERSONAL_STATUSES
from app.modules.classroom_core.service import baseline_answers
from app.modules.classroom_core.service import distribution


# Why a member has no confirmed baseline yet: their personal status, or not_answered.
UNCONFIRMED_KEYS = (*(s for s in PERSONAL_STATUSES if s != "confirmed"), "not_answered")


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
