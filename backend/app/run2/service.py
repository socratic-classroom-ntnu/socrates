"""Use cases. Role authorization is server-side; every classroom transition is atomic."""

from copy import deepcopy
import secrets
import time
from uuid import uuid4
from sqlalchemy import func, select
from .contracts import RoomView
from .orchestrator import DomainError, GameOrchestrator, fresh_state
from .policy import distribution
from .storage import (
    ActionReceipt,
    Membership,
    PointEntry,
    RateBucket,
    Room,
    Script,
    Snapshot,
    append_event,
    digest,
    persist_machine,
    transaction,
)


def limit(db, key: str, maximum: int, seconds: int):
    now = time.time()
    bucket_key = f"{key}:{int(now)//seconds}"
    # Room operations hold their aggregate lock; auth buckets use atomic upsert.
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert

    ins = pg_insert if db.bind.dialect.name == "postgresql" else sqlite_insert
    stmt = ins(RateBucket).values(id=bucket_key, count=1, expires_at=now + seconds)
    value = db.scalar(
        stmt.on_conflict_do_update(
            index_elements=[RateBucket.id], set_={"count": RateBucket.count + 1}
        ).returning(RateBucket.count)
    )
    if value > maximum:
        raise DomainError("稍候即可再次送出。", 429)


def load(db, room_id, account_id, locked=False):
    query = select(Room).where(Room.id == room_id)
    if locked:
        query = query.with_for_update()
    room = db.scalar(query)
    if room is None:
        raise DomainError("CLASSROOM_REQUIRED", 404)
    member = db.scalar(
        select(Membership).where(
            Membership.room_id == room_id,
            Membership.account_id == account_id,
            Membership.role == "student",
        )
    )
    teacher = room.creator_id == account_id
    if not teacher and member is None:
        raise DomainError("CLASSROOM_MEMBERSHIP_REQUIRED", 403)
    return room, member, teacher


def hydrate(db, room):
    s = deepcopy(room.state)
    for m in db.scalars(
        select(Membership).where(Membership.room_id == room.id, Membership.role == "student")
    ):
        if m.id in s["members"]:
            s["members"][m.id]["last_seen"] = m.last_seen
    return s


def view(db, room, account_id, mode="student") -> dict:
    _, member, teacher = load(db, room.id, account_id)
    as_teacher = teacher and mode == "teacher"
    s = hydrate(db, room)
    now = time.time()
    qi = s["question_index"]
    active = s["runs"][qi] if 0 <= qi < len(s["runs"]) else None
    q = s["questions"][qi] if active else None
    focus = next((f for f in active["focuses"] if f["id"] == s["focus"]), None) if active else None
    members = []
    for mid, m in s["members"].items():
        row = {
            "id": mid,
            "alias": m["alias"],
            "avatar": m["avatar"],
            "seat": m["seat"],
            "online": now - m["last_seen"] <= 30,
            "points": m.get("points", 0),
            "achievements": m.get("achievements", []),
            "username": None,
        }
        if as_teacher:
            row["username"] = m["username"]
        members.append(row)
    summaries = deepcopy(s["summaries"])
    # Only own personal synthesis reaches a student projection.
    if not as_teacher:
        summaries["personal"] = {
            k: v
            for k, v in summaries["personal"].items()
            if member and (k == member.id or k.startswith(member.id + ":"))
        }
        if member:
            summaries["personal"].setdefault(member.id, {"status": "NOT_REQUESTED"})
    summaries["statistics"] = [
        {
            "index": i,
            "title": s["questions"][i]["title"],
            "distribution": distribution(s["questions"][i], r["answers"], s["members"], False),
        }
        for i, r in enumerate(s["runs"])
        if r["phase"] == "complete"
    ]
    if as_teacher:
        summaries["records"] = s["runs"]
    elif s["phase"] == "summary":
        # Class summaries are prompted with pseudonymous content only.
        summaries["records"] = []
    actions = []
    if as_teacher:
        if s["phase"] == "lobby":
            actions = ["start"]
        elif s["phase"] == "preview":
            actions = ["approve_question", "regenerate_question", "next"]
        elif s["phase"] in {"answering", "distribution", "focus", "focus_summary"}:
            actions = ["next"]
    if member and not as_teacher:
        if s["phase"] == "answering" and member.id not in active["answers"]:
            actions = ["draft", "answer"]
        if s["phase"] in {"focus", "focus_summary", "arena"}:
            actions += ["barrage", "reaction"]
        if focus and focus["member_id"] == member.id and focus["status"] == "AWAITING_STUDENT":
            actions += ["focus_message"]
        if s["phase"] == "summary":
            actions += ["personal_summary"]
    # No next-question details in a student response; preview belongs to creator control.
    exposed_focus = deepcopy(focus)
    if exposed_focus:
        exposed_focus.pop("last_observations", None)
    return RoomView(
        id=room.id,
        code=room.code if s["phase"] == "lobby" else None,
        title=s["title"],
        role="teacher" if as_teacher else "student",
        member_id=member.id if member else None,
        phase=s["phase"],
        seq=room.seq,
        server_now=now,
        deadline_at=s["deadline_at"],
        question=q,
        question_index=qi,
        question_run_id=active["id"] if active else None,
        question_count=(
            s.get("script", {}).get("max_questions", 0)
            if s.get("script", {}).get("mode") == "dynamic"
            else len(s["questions"])
        ),
        members=members,
        my_draft=active["drafts"].get(member.id) if active and member else None,
        my_answer=active["answers"].get(member.id) if active and member else None,
        distribution=active.get("distribution", [])
        if active and s["phase"] not in {"answering", "countdown"}
        else [],
        focus=exposed_focus,
        transcript=active["focuses"] if active else [],
        preview=s.get("preview") if as_teacher else None,
        summaries=summaries,
        available_actions=actions,
        source_mode=s["source_mode"],
        last_error=s["last_error"],
    ).model_dump()


def create_room(db, a, script_id):
    script = db.get(Script, script_id)
    if script is None or script.owner_id != a.id:
        raise DomainError("SCRIPT_OWNER_REQUIRED", 403)
    room = Room(
        id=str(uuid4()),
        creator_id=a.id,
        script_id=script_id,
        code=secrets.token_hex(4).upper(),
        state=fresh_state(script.document["title"]),
    )
    db.add(room)
    db.flush()
    db.add(
        Membership(
            room_id=room.id,
            account_id=a.id,
            role="teacher",
            alias=a.username,
            avatar="teacher",
            seat=None,
        )
    )
    append_event(db, room, {"type": "classroom.created", "payload": {}})
    return view(db, room, a.id, "teacher")


def join(db, a, body):
    room = db.scalar(select(Room).where(Room.code == body.code.strip().upper()).with_for_update())
    if room is None:
        raise DomainError("COURSE_CODE_REQUIRED", 404)
    prior = db.scalar(
        select(Membership).where(
            Membership.room_id == room.id,
            Membership.account_id == a.id,
            Membership.role == "student",
        )
    )
    if prior:
        return view(db, room, a.id)
    if room.state["phase"] != "lobby":
        raise DomainError("下次開課時可加入；既有成員可直接續接。", 409)
    seat = len(room.state["members"])
    m = Membership(
        id=str(uuid4()),
        room_id=room.id,
        account_id=a.id,
        role="student",
        alias=body.alias,
        avatar=body.avatar[:64],
        seat=seat,
        last_seen=time.time(),
    )
    db.add(m)
    state = deepcopy(room.state)
    state["members"][m.id] = {
        "account_id": a.id,
        "username": a.username,
        "alias": body.alias,
        "avatar": m.avatar,
        "seat": seat,
        "last_seen": m.last_seen,
        "selected_count": 0,
        "points": 0,
        "achievements": [],
        "reactions_sent": 0,
        "reactions_received": 0,
    }
    room.state = state
    append_event(db, room, {"type": "member.joined", "payload": {"member_id": m.id}})
    db.flush()
    return view(db, room, a.id)


def execute(db, a, room_id, cmd):
    room, m, teacher = load(db, room_id, a.id, True)
    key_hash = digest({"kind": cmd.kind, "data": cmd.data})
    prior = db.scalar(
        select(ActionReceipt).where(
            ActionReceipt.room_id == room_id,
            ActionReceipt.actor_id == a.id,
            ActionReceipt.action_id == cmd.action_id,
        )
    )
    if prior:
        if prior.payload_hash != key_hash:
            raise DomainError("ACTION_ID_PAYLOAD_CONFLICT")
        return prior.receipt
    limit(db, f"room-command:{a.id}", 240, 60)
    if m:
        m.last_seen = time.time()
    data = deepcopy(cmd.data)
    if cmd.kind == "start":
        script = db.get(Script, room.script_id)
        snapshot = Snapshot(
            id=str(uuid4()),
            script_id=script.id,
            revision=script.revision,
            document=deepcopy(script.document),
            content_hash=digest(script.document),
        )
        db.add(snapshot)
        room.snapshot_id = snapshot.id
        data["script_document"] = snapshot.document
    state = hydrate(db, room)
    # Triggering a command never finalizes before its real receive time is evaluated.
    machine = GameOrchestrator(state, time.time())
    machine.command(cmd.kind, data, m.id if m else None, teacher)
    persist_machine(db, room, machine)
    receipt = {
        "status": "RECORDED",
        "action_id": cmd.action_id,
        "seq": room.seq,
        "room_id": room.id,
    }
    db.add(
        ActionReceipt(
            room_id=room.id,
            actor_id=a.id,
            action_id=cmd.action_id,
            payload_hash=key_hash,
            receipt=receipt,
        )
    )
    return receipt


def react(db, a, room_id, body):
    room, m, _ = load(db, room_id, a.id, True)
    if m is None:
        raise DomainError("STUDENT_MEMBERSHIP_REQUIRED", 403)
    prior = db.scalar(
        select(ActionReceipt).where(
            ActionReceipt.room_id == room.id,
            ActionReceipt.actor_id == a.id,
            ActionReceipt.action_id == body.action_id,
        )
    )
    hashed = digest(body.model_dump())
    if prior:
        if prior.payload_hash != hashed:
            raise DomainError("ACTION_ID_PAYLOAD_CONFLICT")
        return prior.receipt
    limit(db, "reaction:" + a.id, 60, 60)
    state = deepcopy(room.state)
    if state["phase"] != "focus":
        raise DomainError("FOCUS_REQUIRED")
    r = state["runs"][state["question_index"]]
    f = next(f for f in r["focuses"] if f["id"] == state["focus"])
    if f["id"] != body.focus_id or f["turn_index"] != body.turn_index:
        raise DomainError("FOCUS_ID_REQUIRED")
    receiver = db.get(Membership, f["member_id"])
    if receiver.account_id == a.id:
        raise DomainError("互動對象請選擇其他學員。", 422)
    q = state["questions"][state["question_index"]]
    for person, side, wanted, cap in [
        (m, "sender", 1, q["sender_point_cap"]),
        (receiver, "receiver", 5, q["receiver_point_cap"]),
    ]:
        used = (
            db.scalar(
                select(func.coalesce(func.sum(PointEntry.amount), 0)).where(
                    PointEntry.room_id == room.id,
                    PointEntry.member_id == person.id,
                    PointEntry.focus_id == f["id"],
                    PointEntry.turn_index == body.turn_index,
                    PointEntry.side == side,
                )
            )
            or 0
        )
        award = min(wanted, max(0, cap - used))
        db.add(
            PointEntry(
                room_id=room.id,
                action_id=body.action_id,
                account_id=person.account_id,
                member_id=person.id,
                focus_id=f["id"],
                turn_index=body.turn_index,
                side=side,
                amount=award,
            )
        )
        state["members"][person.id]["points"] += award
    state["members"][m.id]["reactions_sent"] += 1
    state["members"][receiver.id]["reactions_received"] += 1
    machine = GameOrchestrator(state, time.time())
    if state["members"][m.id]["reactions_sent"] >= 10:
        machine.award(m.id, "supporter_10")
    if state["members"][receiver.id]["reactions_received"] >= 10:
        machine.award(receiver.id, "appreciated_10")
    machine.emit("reaction", kind=body.kind, focus_id=f["id"], member_id=receiver.id)
    persist_machine(db, room, machine)
    receipt = {"status": "RECORDED", "seq": room.seq, "action_id": body.action_id}
    db.add(
        ActionReceipt(
            room_id=room.id,
            actor_id=a.id,
            action_id=body.action_id,
            payload_hash=hashed,
            receipt=receipt,
        )
    )
    return receipt


def tick_due(limit_count=20):
    now = time.time()
    with transaction() as db:
        rooms = db.scalars(
            select(Room)
            .where(Room.due_at <= now)
            .order_by(Room.due_at)
            .limit(limit_count)
            .with_for_update(skip_locked=True)
        ).all()
        for room in rooms:
            machine = GameOrchestrator(hydrate(db, room), now)
            machine.tick()
            persist_machine(db, room, machine)
