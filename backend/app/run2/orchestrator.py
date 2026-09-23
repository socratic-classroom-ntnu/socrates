"""Pure GameRun/QuestionRun transition functions. All time is injected by the server.

Return events and job intents; the service commits state+events+jobs together.
Provider work runs after that transaction. An accepted answer is immutable.
"""

from typing import Any
from copy import deepcopy
from uuid import uuid4
from .contracts import ScriptDocument, Question
from .policy import choose_representative, distribution, majority_context, stage_goal


class DomainError(ValueError):
    def __init__(self, code: str, status: int = 409):
        self.code, self.status = code, status
        super().__init__(code)


def fresh_state(title: str) -> dict:
    return {
        "phase": "lobby",
        "title": title,
        "deadline_at": None,
        "due_at": None,
        "members": {},
        "question_index": -1,
        "questions": [],
        "runs": [],
        "focus": None,
        "summaries": {"questions": {}, "class": {"status": "PENDING"}, "personal": {}},
        "pending_generation": None,
        "last_error": None,
        "source_mode": "scripted",
    }


class GameOrchestrator:
    def __init__(self, state: dict, now: float):
        self.s, self.now = deepcopy(state), now
        self.events: list[dict[str, Any]] = []
        self.jobs: list[dict[str, Any]] = []

    def emit(self, event_type: str, **payload):
        self.events.append({"type": event_type, "payload": payload})

    def phase(self, name: str, seconds: float | None = None):
        self.s["phase"] = name
        self.s["deadline_at"] = self.now + seconds if seconds is not None else None
        self.s["due_at"] = self.s["deadline_at"]
        self.emit("phase.changed", phase=name, deadline_at=self.s["deadline_at"])

    def job(self, kind: str, key: str, context: dict):
        self.jobs.append({"key": key, "kind": kind, "context": context})

    def current(self):
        return self.s["runs"][self.s["question_index"]]

    def question(self):
        return self.s["questions"][self.s["question_index"]]

    def award(self, member: str, name: str):
        achievements = self.s["members"][member].setdefault("achievements", [])
        if name not in achievements:
            achievements.append(name)
            self.emit("achievement.unlocked", member_id=member, achievement=name)

    def start_question(self):
        q = self.question()
        run = {
            "id": str(uuid4()),
            "phase": "answering",
            "answers": {},
            "drafts": {},
            "focuses": [],
            "covered_options": [],
            "excluded": [],
            "transcript": [],
        }
        self.s["runs"].append(run)
        self.s["focus"] = None
        self.phase("answering", q["duration_seconds"])
        run["deadline_at"] = self.s["deadline_at"]
        # Finalize only after the declared grace has elapsed.
        self.s["due_at"] = self.s["deadline_at"] + 0.1

    def finalize(self):
        r, q = self.current(), self.question()
        for m, d in r["drafts"].items():
            if m in r["answers"]:
                continue
            option = d.get("option_id")
            argument = d.get("text", "").strip()
            if option in {o["id"] for o in q["options"]} and (
                argument or not q["argument_required"]
            ):
                r["answers"][m] = {
                    "option_id": option,
                    "argument": argument,
                    "submitted_at": self.now,
                    "via": "server-finalize",
                    "revision": d["revision"],
                }
                self.award(m, "first_answer")
        r["phase"] = "distribution"
        r["distribution"] = distribution(q, r["answers"], self.s["members"])
        self.phase("distribution", 5)

    def next_focus(self):
        r, q = self.current(), self.question()
        self.s["focus"] = None
        r["phase"] = "arena"
        for o in q["options"]:
            if o["id"] in r["covered_options"]:
                continue
            chosen = choose_representative(
                o["id"], r["answers"], self.s["members"], set(r["excluded"]), self.now
            )
            r["covered_options"].append(o["id"])
            if chosen is None:
                continue
            focus = {
                "id": str(uuid4()),
                "member_id": chosen,
                "option_id": o["id"],
                "argument": r["answers"][chosen]["argument"],
                "messages": [],
                "turn_index": 0,
                "completed_turns": 0,
                "status": "GENERATING",
                "advance_requested": False,
                "micro_summary": "",
                "last_observations": {},
                "offline_comment": False,
            }
            self.s["members"][chosen]["selected_count"] += 1
            self.award(chosen, "first_focus")
            r["focuses"].append(focus)
            self.s["focus"] = focus["id"]
            self.phase("focus")
            self.queue_tutor(focus)
            return
        self.finish_question()

    def focus(self):
        return next((f for f in self.current()["focuses"] if f["id"] == self.s["focus"]), None)

    def queue_tutor(self, f):
        key = f'focus:{f["id"]}:{f["turn_index"]}'
        f["status"] = "GENERATING"
        f["job_key"] = key
        self.job(
            "focused_tutor",
            key,
            {
                "question": self.question(),
                "option_id": f["option_id"],
                "argument": f["argument"],
                "history": f["messages"],
                "turn_index": f["turn_index"],
                "max_focus_turns": self.question()["max_focus_turns"],
                "focus_id": f["id"],
            },
        )
        self.emit("tutor.started", focus_id=f["id"], generation_id=key)

    def close_focus(self, reason: str):
        f = self.focus()
        if f is None:
            return
        f["status"] = "COMPLETED"
        f["end_reason"] = reason
        f["micro_summary"] = f.get("micro_summary") or (
            "本次討論以此論點展開：" + f["argument"][:300]
        )
        self.emit("focus.completed", focus_id=f["id"], summary=f["micro_summary"])
        self.phase("focus_summary", 3)

    def finish_question(self):
        r = self.current()
        r["phase"] = "complete"
        qi = str(self.s["question_index"])
        context = {
            "question": self.question(),
            "answers": list(r["answers"].values()),
            "focused_chats": r["focuses"],
            "distribution": r.get("distribution", []),
        }
        self.s["summaries"]["questions"][qi] = {"status": "PENDING"}
        self.job("question_summary", f'question-summary:{r["id"]}', context)
        if (
            self.s["script"]["mode"] == "dynamic"
            and len(self.s["runs"]) < self.s["script"]["max_questions"]
        ):
            self.phase("question_summary")
            self.s["pending_generation"] = f'next:{r["id"]}:0'
            self.job(
                "dynamic_question",
                self.s["pending_generation"],
                majority_context(self.question(), r["answers"], r["focuses"]),
            )
            self.s["last_error"] = "下一題正在準備；模型額度恢復後自動續接。"
        elif self.s["question_index"] + 1 < len(self.s["questions"]):
            self.s["question_index"] += 1
            self.start_question()
        else:
            self.phase("summary")
            self.s["closed_at"] = self.now
            for m in self.s["members"]:
                self.award(m, "classroom_complete")
            self.queue_class_summary()

    def queue_class_summary(self):
        items = self.s["summaries"]["questions"]
        if items and all(x.get("status") == "READY" for x in items.values()):
            self.job(
                "class_summary", "class-summary", {"questions": items, "title": self.s["title"]}
            )

    def command(self, kind: str, data: dict, member_id: str | None, teacher: bool):
        s = self.s
        if kind == "start":
            if not teacher:
                raise DomainError("TEACHER_MEMBERSHIP_REQUIRED", 403)
            if s["phase"] != "lobby":
                raise DomainError("LOBBY_REQUIRED")
            doc = ScriptDocument.model_validate(data["script_document"]).model_dump()
            s["script"] = doc
            s["questions"] = deepcopy(
                doc["questions"][:1] if doc["mode"] == "dynamic" else doc["questions"]
            )
            s["question_index"] = 0
            s["started_at"] = self.now
            self.phase("countdown", 3)
            return
        if kind in {"approve_question", "regenerate_question", "next"}:
            if not teacher:
                raise DomainError("TEACHER_MEMBERSHIP_REQUIRED", 403)
            if kind == "next":
                if s["phase"] == "answering":
                    s["deadline_at"] = self.now
                    self.current()["deadline_at"] = self.now
                    s["due_at"] = self.now + 0.1
                    self.emit("answer.closing", deadline_at=self.now)
                    return
                if s["phase"] == "focus":
                    f = self.focus()
                    if f["status"] == "GENERATING":
                        f["advance_requested"] = True
                    else:
                        self.close_focus("teacher_next")
                    return
                if s["phase"] == "distribution":
                    self.next_focus()
                    return
                if s["phase"] == "preview":
                    self.accept_preview()
                    return
                if s["phase"] == "focus_summary":
                    self.next_focus()
                    return
                raise DomainError("CURRENT_PHASE_ACTIONS")
            if s["phase"] != "preview":
                raise DomainError("PREVIEW_REQUIRED")
            if kind == "approve_question":
                self.accept_preview()
                return
            r = self.current()
            r["generation_revision"] = r.get("generation_revision", 0) + 1
            s["pending_generation"] = f'next:{r["id"]}:{r["generation_revision"]}'
            self.job(
                "dynamic_question",
                s["pending_generation"],
                majority_context(self.question(), r["answers"], r["focuses"]),
            )
            s.pop("preview", None)
            self.phase("question_summary")
            return
        if member_id not in s["members"]:
            raise DomainError("STUDENT_MEMBERSHIP_REQUIRED", 403)
        if kind in {"draft", "answer"}:
            if s["phase"] != "answering" or self.now > float(self.current()["deadline_at"]) + 0.1:
                raise DomainError("ANSWER_WINDOW_CLOSED")
            r, q = self.current(), self.question()
            if member_id in r["answers"]:
                raise DomainError("ANSWER_ALREADY_SUBMITTED")
            if data.get("question_run_id") != r["id"]:
                raise DomainError("QUESTION_ID_REQUIRED")
            if data.get("option_id") not in {o["id"] for o in q["options"]}:
                raise DomainError("QUESTION_OPTION_REQUIRED", 422)
            text = str(data.get("text", ""))
            if len(text) > 12000:
                raise DomainError("ARGUMENT_SIZE", 422)
            rev = int(data.get("revision", 0))
            old = r["drafts"].get(member_id, {"revision": -1})
            if rev < old["revision"]:
                return
            r["drafts"][member_id] = {
                "text": text,
                "option_id": data["option_id"],
                "revision": rev,
                "saved_at": self.now,
            }
            if kind == "answer":
                if q["argument_required"] and not text.strip():
                    raise DomainError("ARGUMENT_REQUIRED", 422)
                r["answers"][member_id] = {
                    "option_id": data["option_id"],
                    "argument": text.strip(),
                    "submitted_at": self.now,
                    "via": "submit",
                    "revision": rev,
                }
                self.award(member_id, "first_answer")
                self.emit("answer.recorded", member_id=member_id)
            return
        if kind == "barrage":
            if s["phase"] not in {"focus", "focus_summary", "arena"}:
                raise DomainError("ARENA_REQUIRED")
            text = str(data.get("text", "")).strip()
            if not 1 <= len(text) <= 500:
                raise DomainError("BARRAGE_SIZE", 422)
            self.emit("barrage", text=text)
            return
        if kind == "focus_message":
            if s["phase"] != "focus":
                raise DomainError("FOCUS_REQUIRED")
            f = self.focus()
            if f["member_id"] != member_id or f["status"] != "AWAITING_STUDENT":
                raise DomainError("FOCUS_TURN_REQUIRED")
            text = str(data.get("text", "")).strip()
            if not 1 <= len(text) <= 12000:
                raise DomainError("ARGUMENT_REQUIRED", 422)
            f["messages"].append({"role": "student", "text": text, "at": self.now})
            f["turn_index"] += 1
            s["due_at"] = None
            s["deadline_at"] = None
            self.queue_tutor(f)
            return
        if kind == "personal_summary":
            if s["phase"] != "summary":
                raise DomainError("SUMMARY_PHASE_REQUIRED")
            qi = data.get("question_index")
            if qi is not None and (not isinstance(qi, int) or qi < 0 or qi >= len(s["runs"])):
                raise DomainError("QUESTION_REQUIRED", 422)
            scope = member_id + (":" + str(qi) if qi is not None else "")
            current = s["summaries"]["personal"].get(scope, {})
            if current.get("status") in {"READY", "PENDING"}:
                return
            s["summaries"]["personal"][scope] = {"status": "PENDING"}
            runs = s["runs"] if qi is None else [s["runs"][qi]]
            context = {
                "answers": [r["answers"].get(member_id) for r in runs],
                "discussions": [
                    f for r in runs for f in r["focuses"] if f["member_id"] == member_id
                ],
            }
            self.job("personal_summary", "personal:" + scope, context)
            return
        raise DomainError("KNOWN_ACTION_REQUIRED", 422)

    def accept_preview(self):
        q = Question.model_validate(self.s.pop("preview")).model_dump()
        # Generated questions are run-owned; copying into a teacher draft is an explicit endpoint.
        self.s["questions"].append(q)
        self.s["question_index"] += 1
        self.s["pending_generation"] = None
        self.s["last_error"] = None
        self.start_question()

    def tick(self):
        due = self.s.get("due_at")
        if due is None or self.now < due:
            return
        phase = self.s["phase"]
        if phase == "countdown":
            self.start_question()
        elif phase == "answering":
            self.finalize()
        elif phase == "distribution":
            self.next_focus()
        elif phase == "focus_summary":
            self.next_focus()
        elif phase == "preview":
            self.accept_preview()
        elif phase == "focus":
            self.close_focus("response_window_complete")

    def complete_job(self, kind: str, key: str, result: dict, provider: dict):
        s = self.s
        s["source_mode"] = provider.get("provider", "scripted")
        if kind == "focused_tutor":
            if s["phase"] != "focus":
                return
            f = self.focus()
            if f is None or f.get("job_key") != key:
                return
            f["messages"].append(
                {
                    "role": "tutor",
                    "text": result["reply_text"],
                    "at": self.now,
                    "observations": result["observations"],
                    "provenance": provider,
                    "move": result.get("move", "probe"),
                }
            )
            f["last_observations"] = result["observations"]
            f["micro_summary"] = result.get("micro_summary", "")
            f["completed_turns"] = f["turn_index"]
            self.emit("tutor.final", focus_id=f["id"], generation_id=key, text=result["reply_text"])
            online = self.now - s["members"][f["member_id"]]["last_seen"] <= 30
            if not online:
                f["offline_comment"] = True
                r = self.current()
                r["excluded"].append(f["member_id"])
                r["covered_options"].remove(f["option_id"])
                self.close_focus("reselect_after_argument_comment")
            elif (
                f["advance_requested"]
                or f["completed_turns"] >= self.question()["max_focus_turns"]
                or stage_goal(result["observations"], f["completed_turns"])
            ):
                self.close_focus("teacher_next" if f["advance_requested"] else "policy_complete")
            else:
                f["status"] = "AWAITING_STUDENT"
                s["deadline_at"] = self.now + self.question()["focus_response_seconds"]
                s["due_at"] = s["deadline_at"]
        elif kind == "dynamic_question":
            if key != s.get("pending_generation"):
                return
            s["preview"] = Question.model_validate(result["question"]).model_dump()
            s["last_error"] = None
            self.phase("preview", s["script"]["preview_seconds"])
        elif kind == "question_summary":
            run_id = key.split(":", 1)[1]
            qi = next(str(i) for i, r in enumerate(s["runs"]) if r["id"] == run_id)
            s["summaries"]["questions"][qi] = {"status": "READY", **result, "provenance": provider}
            if s["phase"] == "summary":
                self.queue_class_summary()
            self.emit("summary.ready", kind=kind)
        elif kind == "class_summary":
            s["summaries"]["class"] = {"status": "READY", **result, "provenance": provider}
            self.emit("summary.ready", kind=kind)
        elif kind == "personal_summary":
            m = key.split(":", 1)[1]
            s["summaries"]["personal"][m] = {"status": "READY", **result, "provenance": provider}
            self.emit("summary.ready", kind=kind)
