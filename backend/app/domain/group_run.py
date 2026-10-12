"""R70 GroupRun extension for the existing GameOrchestrator.

The native service retains authentication, row locks, event storage and worker
ownership. This module adds quoted evidence, per-member confirmation and one
complete final reflection phase. Source text remains attributed to its author.
"""

from hashlib import sha256
import json
from uuid import uuid4

from app.orchestrator.classroom_policy import stage_goal

EDGE_TYPES = frozenset({"supports", "challenges", "qualifies", "revises"})
TALK_PHASES = frozenset(
    {
        "answering",
        "distribution",
        "focus",
        "focus_summary",
        "question_summary",
        "preview",
        "viewpoint_review",
        "final_reflection",
    }
)


# 觀點確認只在全部題目與代表討論結束之後（viewpoint_review）與最終反思階段開放：
# 作答或討論途中確認會觸發結算，跳過代表討論並在第一題後結束課堂（QA B01／B17、A01／A08／A11）。
CONFIRM_PHASES = frozenset({"viewpoint_review", "final_reflection"})


# 個人對話（每位學生自己的 AI 追問）：作答後先各自釐清立場，確認的基準才進入多人階段。
# 結束判準只有 orchestrator/policy.py 的 should_advance（經 classroom_policy.stage_goal）；
# 地板 completed_turns >= 1 保證學生至少回應過一次追問才可能進入待確認（QA B3）。
PERSONAL_STATUSES = (
    "probing",
    "awaiting_confirm",
    "confirmed",
    "unclear",
    "capped",
    "incomplete",
    "unavailable",
)
PERSONAL_TERMINAL = frozenset({"confirmed", "unclear", "capped"})
PERSONAL_COMMANDS = frozenset(
    {
        "personal_message",
        "personal_confirm",
        "personal_revise",
        "personal_unclear",
        "personal_retry",
    }
)
# 個人階段的開放範圍：作答中（已作答者即可開始對話）與 personal 階段。
PERSONAL_PHASES = frozenset({"answering", "personal"})
DEFAULT_MAX_PERSONAL_TURNS = 6
DEFAULT_PERSONAL_SECONDS = 600


def fingerprint(value):
    return sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def initialise(group_id, parent_id, snapshot_id, members, label):
    return {
        "revision": 73,
        "kind": "GroupRun",
        "id": group_id,
        "classroom_id": parent_id,
        "label": label,
        "snapshot_id": snapshot_id,
        "member_snapshot": list(members),
        "runtime_mode": "native-group-stage",
        "arguments": [],
        "edges": [],
        "confirmations": {},
        "settlement": {"state": "EXPLORING"},
        "source_mode": "native-provider",
    }


def person_summary(state, member_id):
    p = state["group"]
    rows = [
        n
        for n in p["arguments"]
        if n["member_id"] == member_id and n["kind"] != "confirmed_viewpoint"
    ]
    summary = {
        "group_id": p["id"],
        "member_id": member_id,
        "quotes": [{"id": n["id"], "text": n["text"], "stage": n["stage"]} for n in rows],
    }
    return {**summary, "digest": fingerprint(summary)}


def record_statement(
    state, member_id, text, now, *, relation="qualifies", parents=(), node_id=None
):
    from app.orchestrator.classroom import DomainError

    p = state["group"]
    if member_id not in p["member_snapshot"]:
        raise DomainError("GROUP_MEMBERSHIP_REQUIRED", 403)
    if state["phase"] not in TALK_PHASES:
        raise DomainError("DIALOGUE_PHASE_REQUIRED", 409)
    if (
        not isinstance(text, str)
        or not isinstance(parents, (list, tuple))
        or any(not isinstance(x, str) for x in parents)
    ):
        raise DomainError("TYPED_STATEMENT_AND_PARENT_IDS_REQUIRED", 422)
    text = text.strip()
    if not 1 <= len(text) <= 12000:
        raise DomainError("STATEMENT_LENGTH_1_TO_12000", 422)
    if relation not in EDGE_TYPES:
        raise DomainError("ARGUMENT_RELATION_REQUIRED", 422)
    known = {
        n["id"]
        for n in p["arguments"]
        if n.get("member_id") == member_id or n.get("visibility") in {"stage", "group_shared"}
    }
    if any(x not in known for x in parents) or len(parents) > 8:
        raise DomainError("EXISTING_GROUP_ARGUMENT_REQUIRED", 422)
    nid = node_id or str(uuid4())
    if nid in known:
        raise DomainError("FRESH_ARGUMENT_ID_REQUIRED", 409)
    # Every edge leads from an existing node to a new node: DAG by construction.
    node = {
        "id": nid,
        "member_id": member_id,
        "text": text,
        "at": float(now),
        "sequence": len(p["arguments"]),
        "stage": state["phase"],
        "question_index": state["question_index"],
        "kind": "post_ack_observation" if member_id in p["confirmations"] else "statement",
        "provenance": "student_original_quote",
        "visibility": "personal",
    }
    p["arguments"].append(node)
    p["edges"].extend(
        {
            "source": source,
            "target": nid,
            "type": relation,
            "provenance": "student_selected_relation",
        }
        for source in dict.fromkeys(parents)
    )
    return node


def confirm(state, member_id, digest, now):
    from app.orchestrator.classroom import DomainError

    p = state["group"]
    if member_id not in p["member_snapshot"]:
        raise DomainError("GROUP_MEMBERSHIP_REQUIRED", 403)
    if state["phase"] not in CONFIRM_PHASES:
        raise DomainError("CONFIRMABLE_PHASE_REQUIRED", 409)
    summary = person_summary(state, member_id)
    if not summary["quotes"]:
        raise DomainError("QUOTED_VIEWPOINT_REQUIRED", 409)
    if digest != summary["digest"]:
        raise DomainError("CURRENT_SUMMARY_DIGEST_REQUIRED", 409)
    if member_id in p["confirmations"]:
        return p["confirmations"][member_id]
    record = {
        "member_id": member_id,
        "summary_digest": digest,
        "summary": summary,
        "at": float(now),
        "authority": "student_explicit_confirmation",
    }
    p["confirmations"][member_id] = record
    nid = str(uuid4())
    p["arguments"].append(
        {
            "id": nid,
            "member_id": member_id,
            "text": summary["quotes"][-1]["text"],
            "at": float(now),
            "sequence": len(p["arguments"]),
            "kind": "confirmed_viewpoint",
            "stage": state["phase"],
            "question_index": state["question_index"],
            "summary_digest": digest,
            "provenance": "student_explicit_confirmation",
        }
    )
    p["edges"].append(
        {
            "source": summary["quotes"][-1]["id"],
            "target": nid,
            "type": "qualifies",
            "provenance": "confirmation_snapshot",
        }
    )
    if p["member_snapshot"] and all(m in p["confirmations"] for m in p["member_snapshot"]):
        p["settlement"] = {
            "state": "CURRENT_PHASE_FINISHING",
            "latched_at": float(now),
            "latched_phase": state["phase"],
            "final_stage_count": 0,
        }
        if state.get("due_at") is None:
            state["due_at"] = now + 30
            state["deadline_at"] = now + 30
    return record


def personal_entries(state):
    """Personal dialogues of the current question run ({} before the first question)."""
    runs = state.get("runs") or []
    index = state.get("question_index", -1)
    if not 0 <= index < len(runs):
        return {}
    return runs[index].get("personal", {})


def personal_open(state):
    runs = state.get("runs") or []
    index = state.get("question_index", -1)
    return (
        0 <= index < len(runs)
        and state.get("phase") in PERSONAL_PHASES
        and not runs[index].get("personal_closed")
    )


def personal_digest(run_id, member_id, entry):
    return fingerprint(
        {
            "run_id": run_id,
            "member_id": member_id,
            "turn_index": entry["turn_index"],
            "summary": entry.get("summary"),
        }
    )


def personal_summary_value(raw):
    raw = raw if isinstance(raw, dict) else {}
    conditions = raw.get("relevant_conditions") or []
    return {
        "current_position": str(raw.get("current_position", "")).strip(),
        "reason_summary": str(raw.get("reason_summary", "")).strip(),
        "relevant_conditions": [str(c).strip() for c in conditions if str(c).strip()][:12],
        "unresolved_issue": str(raw.get("unresolved_issue", "")).strip(),
    }


def personal_student_view(state, member_id):
    """The student's own dialogue only; observations and provenance stay server-side."""
    entry = personal_entries(state).get(member_id)
    if entry is None:
        return None
    question = state["questions"][state["question_index"]]
    return {
        "status": entry["status"],
        "generating": bool(entry.get("generating")),
        "messages": [{"role": m["role"], "text": m["text"]} for m in entry["messages"]],
        "completed_turns": entry["completed_turns"],
        "max_turns": question.get("max_personal_turns", DEFAULT_MAX_PERSONAL_TURNS),
        "summary": entry.get("summary"),
        "summary_digest": entry.get("summary_digest"),
        "baseline": entry.get("baseline"),
        "notice": entry.get("notice"),
        "open": personal_open(state),
    }


def personal_teacher_view(state):
    """Teacher sees status, candidate summary and baseline, never the private messages."""
    rows = []
    is_open = personal_open(state)
    for member_id, entry in personal_entries(state).items():
        rows.append(
            {
                "member_id": member_id,
                "alias": state["members"][member_id]["alias"],
                "status": entry["status"],
                "generating": bool(entry.get("generating")),
                "completed_turns": entry["completed_turns"],
                "summary": entry.get("summary"),
                "baseline": entry.get("baseline"),
                "end_reason": entry.get("end_reason"),
                # Teacher commands for this row, decided here like the students' actions.
                "actions": ["personal_retry"]
                if is_open and entry["status"] == "unavailable"
                else [],
            }
        )
    return rows


def personal_progress(state):
    """Per-status counts for the current question; unanswered members are counted apart."""
    entries = personal_entries(state)
    counts = {status: 0 for status in PERSONAL_STATUSES}
    for entry in entries.values():
        counts[entry["status"]] += 1
    members = state.get("group", {}).get("member_snapshot") or list(state.get("members", {}))
    counts["not_answered"] = sum(1 for m in members if m not in entries)
    return counts


def personal_records(runs):
    """Run records for teacher projections without the private personal messages."""
    result = []
    for run in runs:
        if "personal" not in run:
            result.append(run)
            continue
        result.append(
            {
                **run,
                "personal": {
                    m: {k: v for k, v in e.items() if k not in {"messages", "last_observations"}}
                    for m, e in run["personal"].items()
                },
            }
        )
    return result


def baseline_answers(run):
    """Confirmed baselines as answers: the only input to distribution and representatives."""
    result = {}
    for member_id, entry in run.get("personal", {}).items():
        baseline = entry.get("baseline")
        if not baseline:
            continue
        answer = run["answers"].get(member_id, {})
        result[member_id] = {
            "option_id": baseline["option_id"],
            "argument": baseline.get("reason_summary") or answer.get("argument", ""),
        }
    return result


def student_actions(state, member_id):
    """Every command this student may send now; the frontend renders only these."""
    p = state.get("group")
    if not p or member_id not in p["member_snapshot"]:
        return []
    phase = state["phase"]
    actions = []
    runs = state.get("runs") or []
    index = state.get("question_index", -1)
    run = runs[index] if 0 <= index < len(runs) else None
    if phase == "answering" and run is not None and member_id not in run["answers"]:
        actions += ["draft", "answer"]
    entry = personal_entries(state).get(member_id)
    if entry is not None and personal_open(state):
        if entry["status"] == "probing" and not entry.get("generating"):
            actions.append("personal_message")
        elif entry["status"] == "awaiting_confirm":
            actions += ["personal_confirm", "personal_revise", "personal_unclear"]
        elif entry["status"] == "unavailable":
            actions.append("personal_retry")
    settled = p["settlement"]["state"] == "SETTLED"
    if phase in TALK_PHASES and not settled:
        actions.append("group_statement")
    if (
        phase in CONFIRM_PHASES
        and member_id not in p["confirmations"]
        and person_summary(state, member_id)["quotes"]
    ):
        actions.append("group_ack")
    return actions


def extend(Native):
    """Install one additive subclass at the native orchestrator module boundary."""

    class StageBoundary(Exception):
        pass

    class GroupOrchestrator(Native):  # type: ignore[valid-type,misc]
        def group(self):
            return self.s.get("group")

        def phase(self, name, seconds=None):
            p = self.group()
            if p and name != self.s["phase"]:
                settlement = p["settlement"]
                if settlement["state"] == "CURRENT_PHASE_FINISHING":
                    settlement.update(state="FINAL_STAGE", started_at=self.now, final_stage_count=1)
                    self.s["focus"] = None
                    self.s["pending_generation"] = None
                    # Successor provider calls are represented by a later run.
                    self.jobs = [j for j in self.jobs if j["kind"].endswith("summary")]  # type: ignore[has-type]
                    Native.phase(self, "final_reflection", 60)
                    self.emit("group.final_stage.started", group_id=p["id"])
                    raise StageBoundary()
                if name == "summary" and settlement["state"] == "EXPLORING":
                    Native.phase(self, "viewpoint_review")
                    self.emit("group.viewpoint_review", group_id=p["id"])
                    raise StageBoundary()
            return Native.phase(self, name, seconds)

        def settle(self, *, ended_by="system", force=False):
            p = self.group()
            if not force and p["settlement"]["state"] != "FINAL_STAGE":
                from app.orchestrator.classroom import DomainError

                raise DomainError("COMPLETE_FINAL_STAGE_REQUIRED", 409)
            incomplete = [m for m in p["member_snapshot"] if m not in p["confirmations"]]
            p["settlement"].update(
                state="SETTLED",
                settled_at=self.now,
                ended_by=ended_by,
                end_reason="teacher_force_end" if force else "final_stage_complete",
                incomplete_members=incomplete,
                member_status={
                    m: "confirmed" if m in p["confirmations"] else "incomplete"
                    for m in p["member_snapshot"]
                },
            )
            self.s["focus"] = None
            self.s["pending_generation"] = None
            self.s["closed_at"] = self.now
            if self.s.get("runs"):
                self.current()["phase"] = "complete"
            Native.phase(self, "summary")
            # Deterministic, attributed evidence is immediately readable.
            self.s["summaries"]["class"] = {
                "status": "READY",
                "text": "本組原話、觀點確認與後續補充已保存。",
                "key_points": [
                    self.s["members"][m]["alias"]
                    + "："
                    + p["confirmations"][m]["summary"]["quotes"][-1]["text"]
                    for m in p["member_snapshot"]
                    if m in p["confirmations"]
                ],
                "provenance": {"provider": "student_confirmed_quote_projection"},
            }
            self.emit(
                "group.settled",
                group_id=p["id"],
                ended_by=ended_by,
                incomplete_members=incomplete,
                confirmation_digests={
                    m: c["summary_digest"] for m, c in p["confirmations"].items()
                },
            )

        def command(self, kind, data, member_id, teacher):
            p = self.group()
            if not p:
                return Native.command(self, kind, data, member_id, teacher)
            from app.orchestrator.classroom import DomainError

            try:
                if kind in PERSONAL_COMMANDS:
                    return self.personal_command(kind, data, member_id, teacher)
                if kind == "next" and self.s["phase"] == "personal":
                    if not teacher:
                        raise DomainError("TEACHER_MEMBERSHIP_REQUIRED", 403)
                    return self.close_personal("teacher_next")
                if kind == "group_statement":
                    node = record_statement(
                        self.s,
                        member_id,
                        data.get("text", ""),
                        self.now,
                        relation=data.get("relation", "qualifies"),
                        parents=data.get("parents", []),
                    )
                    self.emit("group.statement", argument_id=node["id"], member_id=member_id)
                    return
                if kind == "group_ack":
                    ack = confirm(self.s, member_id, data.get("summary_digest"), self.now)
                    self.emit(
                        "group.viewpoint.confirmed",
                        member_id=member_id,
                        summary_digest=ack["summary_digest"],
                    )
                    return
                if kind == "end":
                    if not teacher:
                        raise DomainError("TEACHER_MEMBERSHIP_REQUIRED", 403)
                    if p["settlement"]["state"] == "SETTLED":
                        raise DomainError("GROUP_ALREADY_SETTLED", 409)
                    return self.settle(ended_by="teacher", force=True)
                if self.s["phase"] == "final_reflection" and kind == "next":
                    if not teacher:
                        raise DomainError("TEACHER_MEMBERSHIP_REQUIRED", 403)
                    return self.settle()
                if self.s["phase"] == "viewpoint_review" and kind == "next":
                    if not teacher:
                        raise DomainError("TEACHER_MEMBERSHIP_REQUIRED", 403)
                    if p["settlement"]["state"] == "CURRENT_PHASE_FINISHING":
                        self.phase("final_reflection", 60)
                    return
                if kind in {"answer", "focus_message"} and data.get("text", "").strip():
                    node = record_statement(self.s, member_id, data["text"], self.now)
                    if kind == "focus_message":
                        node["visibility"] = "stage"
                    self.emit("group.statement", argument_id=node["id"], member_id=member_id)
                answered = set(self.current()["answers"]) if self.s.get("runs") else set()
                result = Native.command(self, kind, data, member_id, teacher)
                if kind == "answer" and self.uses_personal():
                    for m in self.current()["answers"]:
                        if m not in answered:
                            self.start_personal(m)
                return result
            except StageBoundary:
                return

        # ---- personal dialogue -------------------------------------------------------------

        def uses_personal(self):
            return bool(self.group())

        def max_personal_turns(self):
            return int(self.question().get("max_personal_turns", DEFAULT_MAX_PERSONAL_TURNS))

        def start_personal(self, member_id):
            """An accepted answer opens this student's own dialogue (AI students skip it)."""
            run = self.current()
            personal = run.setdefault("personal", {})
            if member_id in personal or run.get("personal_closed"):
                return
            answer = run["answers"][member_id]
            options = {o["id"]: o["text"] for o in self.question()["options"]}
            if self.s["members"][member_id].get("actor_type") == "llm_student":
                personal[member_id] = {
                    "status": "confirmed",
                    "generating": False,
                    "messages": [],
                    "turn_index": 0,
                    "completed_turns": 0,
                    "attempt": 0,
                    "job_key": None,
                    "summary": None,
                    "summary_digest": None,
                    "baseline": {
                        "option_id": answer["option_id"],
                        "position": options.get(answer["option_id"], ""),
                        "reason_summary": answer["argument"],
                        "conditions": [],
                        "confirmed_at": self.now,
                        "evidence": [],
                        "source": "ai_student",
                    },
                    "end_reason": "ai_student",
                }
                self.emit("personal.baseline", member_id=member_id, source="ai_student")
                return
            text = answer["argument"] or (
                "我選擇「" + options.get(answer["option_id"], "") + "」，還沒有寫下理由。"
            )
            entry = {
                "status": "probing",
                "generating": False,
                "messages": [{"role": "student", "text": text, "at": self.now, "kind": "answer"}],
                "turn_index": 0,
                "completed_turns": 0,
                "attempt": 0,
                "job_key": None,
                "last_observations": {},
                "summary": None,
                "summary_digest": None,
                "baseline": None,
                "started_at": self.now,
            }
            personal[member_id] = entry
            self.queue_personal(member_id, entry)

        def queue_personal(self, member_id, entry):
            run = self.current()
            key = f'personal:{run["id"]}:{member_id}:{entry["turn_index"]}:{entry["attempt"]}'
            entry.update(status="probing", generating=True, job_key=key, notice=None)
            answer = run["answers"][member_id]
            options = {o["id"]: o["text"] for o in self.question()["options"]}
            # Only the teacher's question, this student's own answer and this dialogue.
            self.job(
                "personal_tutor",
                key,
                {
                    "question": self.question(),
                    "option_id": answer["option_id"],
                    "option_text": options.get(answer["option_id"], ""),
                    "argument": answer["argument"],
                    "history": [{"role": m["role"], "text": m["text"]} for m in entry["messages"]],
                    "turn_index": entry["turn_index"],
                    "max_personal_turns": self.max_personal_turns(),
                },
            )
            self.emit("personal.tutor.started", member_id=member_id, generation_id=key)

        def personal_command(self, kind, data, member_id, teacher):
            from app.orchestrator.classroom import DomainError

            if teacher and kind == "personal_retry" and member_id is None:
                member_id = data.get("member_id")
            p = self.group()
            if member_id not in p["member_snapshot"]:
                raise DomainError("GROUP_MEMBERSHIP_REQUIRED", 403)
            if not self.uses_personal() or not self.s.get("runs"):
                raise DomainError("PERSONAL_DIALOGUE_REQUIRED", 409)
            entry = self.current().get("personal", {}).get(member_id)
            if entry is None:
                raise DomainError("PERSONAL_DIALOGUE_REQUIRED", 409)
            if not personal_open(self.s):
                raise DomainError("PERSONAL_WINDOW_CLOSED", 409)
            status = entry["status"]
            if kind == "personal_message":
                if status != "probing" or entry.get("generating"):
                    raise DomainError("PERSONAL_TURN_REQUIRED", 409)
                self.personal_reply(member_id, entry, data, "reply")
            elif kind == "personal_revise":
                if status != "awaiting_confirm":
                    raise DomainError("PERSONAL_CONFIRM_REQUIRED", 409)
                # A rejected summary is never kept as the student's stance.
                entry["rejected_summaries"] = [
                    *entry.get("rejected_summaries", []),
                    entry.get("summary"),
                ]
                entry.update(summary=None, summary_digest=None)
                self.personal_reply(member_id, entry, data, "revision")
            elif kind == "personal_confirm":
                if status != "awaiting_confirm":
                    raise DomainError("PERSONAL_CONFIRM_REQUIRED", 409)
                if data.get("summary_digest") != entry["summary_digest"]:
                    raise DomainError("CURRENT_SUMMARY_DIGEST_REQUIRED", 409)
                summary = entry["summary"]
                entry["baseline"] = {
                    "option_id": self.current()["answers"][member_id]["option_id"],
                    "position": summary["current_position"],
                    "reason_summary": summary["reason_summary"],
                    "conditions": list(summary["relevant_conditions"]),
                    "confirmed_at": self.now,
                    "evidence": [
                        i for i, m in enumerate(entry["messages"]) if m["role"] == "student"
                    ],
                    "summary_digest": entry["summary_digest"],
                    "source": "student_confirmed",
                }
                entry.update(status="confirmed", end_reason="student_confirmed")
                self.emit("personal.baseline", member_id=member_id, source="student_confirmed")
            elif kind == "personal_unclear":
                if status != "awaiting_confirm":
                    raise DomainError("PERSONAL_CONFIRM_REQUIRED", 409)
                entry.update(status="unclear", end_reason="student_unclear")
                self.emit("personal.unclear", member_id=member_id)
            else:  # personal_retry
                if status != "unavailable":
                    raise DomainError("PERSONAL_RETRY_REQUIRED", 409)
                entry["attempt"] += 1
                self.queue_personal(member_id, entry)
            self.maybe_finish_personal()

        def personal_reply(self, member_id, entry, data, message_kind):
            from app.orchestrator.classroom import DomainError

            text = data.get("text")
            text = text.strip() if isinstance(text, str) else ""
            if not 1 <= len(text) <= 12000:
                raise DomainError("ARGUMENT_REQUIRED", 422)
            # Persisted with the state before the provider job is claimed.
            entry["messages"].append(
                {"role": "student", "text": text, "at": self.now, "kind": message_kind}
            )
            entry["turn_index"] += 1
            entry["attempt"] = 0
            self.queue_personal(member_id, entry)

        def complete_personal(self, key, result, provider):
            from app.orchestrator.classroom import tutor_unavailable_notice

            parts = key.split(":")
            if len(parts) != 5:
                return
            run_id, member_id = parts[1], parts[2]
            run = next((r for r in self.s.get("runs", []) if r["id"] == run_id), None)
            entry = (run or {}).get("personal", {}).get(member_id)
            # Stale, duplicate or late results (other turn, closed stage) never advance.
            if (
                entry is None
                or entry.get("job_key") != key
                or entry["status"] != "probing"
                or not entry.get("generating")
            ):
                return
            entry["generating"] = False
            if "tutor_unavailable" in result:
                entry.update(
                    status="unavailable",
                    unavailable_reason=result["tutor_unavailable"],
                    # Same cause sentence as the classroom notice; the remedy here is a retry.
                    notice=tutor_unavailable_notice(result["tutor_unavailable"]).split("。")[0]
                    + "。你的訊息已保存，可稍後按「重試」。",
                )
                self.emit("personal.tutor.unavailable", member_id=member_id, generation_id=key)
                return
            observations = result["observations"]
            entry["messages"].append(
                {
                    "role": "tutor",
                    "text": result["reply_text"],
                    "at": self.now,
                    "observations": observations,
                    "provenance": provider,
                    "move": result.get("move", "probe"),
                }
            )
            entry["last_observations"] = observations
            entry["summary"] = personal_summary_value(result.get("summary"))
            entry["completed_turns"] = entry["turn_index"]
            # Goal before cap, as for a focus; the goal is the shared Round 1 policy.
            if stage_goal(observations, entry["completed_turns"]):
                entry["status"] = "awaiting_confirm"
                entry["summary_digest"] = personal_digest(run_id, member_id, entry)
            elif entry["completed_turns"] >= self.max_personal_turns():
                entry.update(status="capped", end_reason="capped")
            self.emit(
                "personal.tutor.final",
                member_id=member_id,
                generation_id=key,
                status=entry["status"],
            )
            self.maybe_finish_personal()

        def personal_pending(self):
            return any(
                e["status"] not in PERSONAL_TERMINAL
                for e in self.current().get("personal", {}).values()
            )

        def maybe_finish_personal(self):
            if self.s["phase"] == "personal" and not self.personal_pending():
                self.close_personal("all_settled")

        def close_personal(self, reason):
            run = self.current()
            for entry in run.get("personal", {}).values():
                if entry["status"] not in PERSONAL_TERMINAL:
                    entry.update(
                        status="incomplete",
                        generating=False,
                        end_reason=reason,
                        status_at_close=entry["status"],
                    )
            run["personal_closed"] = True
            run["personal_closed_reason"] = reason
            self.emit("personal.closed", reason=reason)
            self.open_distribution()

        def open_distribution(self):
            if not self.uses_personal():
                return Native.open_distribution(self)
            run = self.current()
            run["personal_closed"] = True
            answered = len(run["answers"])
            Native.open_distribution(self)
            # Members without a baseline are not in the distribution; the teacher sees them apart.
            run["distribution_basis"] = "personal_baseline"
            run["distribution_excluded"] = answered - len(baseline_answers(run))

        def representative_answers(self):
            if not self.uses_personal():
                return Native.representative_answers(self)
            return baseline_answers(self.current())

        def finalize(self):
            if not self.uses_personal():
                return Native.finalize(self)
            run = self.current()
            answered = set(run["answers"])
            self.accept_drafts()
            for m in run["answers"]:
                if m not in answered:
                    self.start_personal(m)
            if self.personal_pending():
                run["phase"] = "personal"
                seconds = int(self.question().get("personal_seconds", DEFAULT_PERSONAL_SECONDS))
                return self.phase("personal", seconds)
            return self.open_distribution()

        def next_focus(self):
            result = Native.next_focus(self)
            focus = self.focus() if self.s.get("focus") else None
            if focus and self.group():
                answer = self.current()["answers"].get(focus["member_id"], {})
                texts = {focus["argument"], answer.get("argument")}
                for node in self.group()["arguments"]:
                    if (
                        node["member_id"] == focus["member_id"]
                        and node["question_index"] == self.s["question_index"]
                        and node["text"] in texts
                    ):
                        node["visibility"] = "stage"
            return result

        def tick(self):
            p = self.group()
            if not p:
                return Native.tick(self)
            try:
                if self.s.get("due_at") is not None and self.now >= self.s["due_at"]:
                    if self.s["phase"] == "final_reflection":
                        return self.settle()
                    if self.s["phase"] == "personal":
                        return self.close_personal("deadline")
                    if p["settlement"]["state"] == "CURRENT_PHASE_FINISHING" and self.s[
                        "phase"
                    ] in {"viewpoint_review", "question_summary"}:
                        self.phase("final_reflection", 60)
                return Native.tick(self)
            except StageBoundary:
                return

        def complete_job(self, kind, key, result, provider):
            try:
                if kind == "personal_tutor":
                    self.s["source_mode"] = provider.get("provider", "scripted")
                    return self.complete_personal(key, result, provider)
                return Native.complete_job(self, kind, key, result, provider)
            except StageBoundary:
                return

    GroupOrchestrator.__name__ = "GameOrchestrator"
    return GroupOrchestrator
