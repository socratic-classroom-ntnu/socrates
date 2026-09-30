"""GroupRun HTTP adapters on the native Run2 authentication and persistence layer."""
from copy import deepcopy
from types import SimpleNamespace
from uuid import UUID, uuid4, uuid5
import secrets
import time
from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from .storage import Room, Membership, Script, Snapshot, ActionReceipt, transaction, digest, append_event, persist_machine
from .orchestrator import GameOrchestrator, DomainError, fresh_state
from .portal_group_domain import initialise, person_summary
from .portal_group_analysis import analysis as project_analysis
from . import service
from .portal_r73_contract import visible_evidence
from .portal_classroom_library import link_group_session,ClassroomAssets

router = APIRouter(prefix='/groups')


class Configure(BaseModel):
    action_id: str = Field(min_length=1, max_length=100)
    expected_roster_digest: str
    group_count: int = Field(ge=1, le=40)
    members_per_group: int = Field(ge=1, le=40)
    assignments: dict[str, int] = Field(default_factory=dict)
    avatar_pack_id: str = Field(default='stickman', min_length=1, max_length=120)


class Start(BaseModel):
    action_id: str = Field(min_length=1, max_length=100)
    expected_roster_digest: str
    accept_temporary_aliases: bool = False


class GroupCommand(BaseModel):
    action_id: str = Field(min_length=1, max_length=100)
    kind: str
    data: dict = Field(default_factory=dict)


def actor(db, request, mutation=False):
    # Resolve the already-initialised native adapter lazily to preserve imports.
    from .api import account
    return account(db, request, mutation)[0]


def roster(db, room):
    return list(db.scalars(select(Membership).where(Membership.room_id == room.id,
                        Membership.role == 'student').order_by(Membership.seat, Membership.id)))


def roster_hash(rows):
    return digest([{'id': r.id, 'alias': r.alias, 'seat': r.seat} for r in rows])


def receipt(db, room, a, body, operation):
    hashed = digest({'operation': operation, **body.model_dump()})
    old = db.scalar(select(ActionReceipt).where(ActionReceipt.room_id == room.id,
        ActionReceipt.actor_id == a.id, ActionReceipt.action_id == body.action_id))
    if old:
        if old.payload_hash != hashed:
            raise DomainError('ACTION_ID_PAYLOAD_CONFLICT', 409)
        return hashed, old.receipt
    return hashed, None


def save_receipt(db, room, a, body, hashed, value):
    db.add(ActionReceipt(room_id=room.id, actor_id=a.id, action_id=body.action_id,
                         payload_hash=hashed, receipt=value))
    return value


def teacher_room(db, rid, a):
    room, _, teacher = service.load(db, rid, a.id, True)
    if not teacher:
        raise DomainError('TEACHER_MEMBERSHIP_REQUIRED', 403)
    if room.state.get('portal_group'):
        raise DomainError('CLASSROOM_PARENT_REQUIRED', 422)
    return room


def allocate(rows, count, capacity, chosen):
    members = {r.id for r in rows}
    if set(chosen) - members:
        raise DomainError('CURRENT_ROSTER_REQUIRED', 409)
    result, sizes = {}, [0] * count
    for mid, number in chosen.items():
        if not 0 <= number < count:
            raise DomainError('GROUP_INDEX_REQUIRED', 422)
        result[mid] = number
        sizes[number] += 1
    if any(x > capacity for x in sizes) or len(rows) > count * capacity:
        raise DomainError('GROUP_CAPACITY_REQUIRED', 409)
    for r in rows:
        if r.id not in result:
            number = min(range(count), key=lambda i: (sizes[i], i))
            if sizes[number] >= capacity:
                raise DomainError('GROUP_CAPACITY_REQUIRED', 409)
            result[r.id] = number
            sizes[number] += 1
    return result


@router.post('/classrooms/{rid}/configure')
def configure(rid: str, body: Configure, request: Request):
    with transaction() as db:
        a = actor(db, request, True)
        room = teacher_room(db, rid, a)
        hashed, prior = receipt(db, room, a, body, 'configure')
        if prior:
            return prior
        if room.state['phase'] != 'lobby':
            raise DomainError('LOBBY_REQUIRED', 409)
        rows = roster(db, room)
        if body.expected_roster_digest != roster_hash(rows):
            raise DomainError('CURRENT_ROSTER_DIGEST_REQUIRED', 409)
        assignments = allocate(rows, body.group_count, body.members_per_group, body.assignments)
        state = deepcopy(room.state)
        old = state.get('portal_classroom', {})
        state['portal_classroom'] = {'revision': old.get('revision', 0) + 1,
            'state': 'CONFIGURED', 'group_count': body.group_count,
            'members_per_group': body.members_per_group, 'assignments': assignments,
            'avatar_pack_id': body.avatar_pack_id, 'roster_digest': roster_hash(rows)}
        room.state = state
        cid = state.get('asset_classroom_id')
        if cid:
            asset_classroom = db.scalar(select(ClassroomAssets).where(ClassroomAssets.id==cid).with_for_update())
            if asset_classroom is None or asset_classroom.owner_id != a.id:
                raise DomainError('CLASSROOM_ASSET_OWNER_REQUIRED',403)
            assets = deepcopy(asset_classroom.assets)
            assets.update(avatar_pack_id=body.avatar_pack_id,group_count=body.group_count,members_per_group=body.members_per_group)
            asset_classroom.assets=assets;asset_classroom.revision+=1
        append_event(db, room, {'type': 'groups.configured', 'payload': {'revision': state['portal_classroom']['revision']}})
        return save_receipt(db, room, a, body, hashed,
                            {'status': 'RECORDED', 'action_id': body.action_id, 'seq': room.seq})


@router.post('/classrooms/{rid}/start')
def start(rid: str, body: Start, request: Request):
    with transaction() as db:
        a = actor(db, request, True)
        room = teacher_room(db, rid, a)
        hashed, prior = receipt(db, room, a, body, 'start')
        if prior:
            return prior
        if room.state['phase'] != 'lobby':
            raise DomainError('LOBBY_REQUIRED', 409)
        rows = roster(db, room)
        if not rows or body.expected_roster_digest != roster_hash(rows):
            raise DomainError('CURRENT_POPULATED_ROSTER_REQUIRED', 409)
        state = deepcopy(room.state)
        cfg = state.get('portal_classroom')
        if not cfg or cfg['roster_digest'] != roster_hash(rows):
            raise DomainError('CURRENT_GROUP_CONFIGURATION_REQUIRED', 409)
        assignments = allocate(rows, cfg['group_count'], cfg['members_per_group'], cfg['assignments'])
        # Only populated groups instantiate a runtime; the configured empty slots stay visible.
        script = db.scalar(select(Script).where(Script.id == room.script_id).with_for_update())
        if script is None or script.owner_id != a.id:
            raise DomainError('SCRIPT_OWNER_REQUIRED', 403)
        snap = Snapshot(id=str(uuid4()), script_id=script.id, revision=script.revision,
                        document=deepcopy(script.document), content_hash=digest(script.document))
        db.add(snap)
        db.flush()
        room.snapshot_id = snap.id
        temporary = [r for r in rows if not r.alias.strip() or r.alias.startswith('~pending-')]
        if temporary and not body.accept_temporary_aliases:
            raise DomainError('TEACHER_TEMPORARY_ALIAS_CONFIRMATION_REQUIRED', 409)
        asset_id = state.get('asset_classroom_id')
        assets = db.scalar(select(ClassroomAssets).where(ClassroomAssets.id==asset_id).with_for_update()) if asset_id else None
        if asset_id and (assets is None or assets.owner_id != a.id):
            raise DomainError('CLASSROOM_ASSET_OWNER_REQUIRED',403)
        asset_snapshot = {'classroom_id':asset_id,'classroom_revision':assets.revision if assets else None,
            'assets':deepcopy(assets.assets) if assets else {},'script_snapshot_id':snap.id,
            'script_sha256':snap.content_hash,'avatar_pack_id':cfg['avatar_pack_id']}
        asset_snapshot['digest'] = digest(asset_snapshot)
        state['asset_snapshot'] = asset_snapshot
        now, groups, mapping = time.time(), [], {}
        for number in range(cfg['group_count']):
            assigned = [r for r in rows if assignments[r.id] == number]
            if not assigned:
                continue
            gid = str(uuid5(UUID(room.id), f'r70:group:{body.action_id}:{number}'))
            g = Room(id=gid, creator_id=a.id, script_id=script.id, snapshot_id=snap.id,
                     code=secrets.token_hex(4).upper(), state=fresh_state(script.document['title']), seq=0)
            db.add(g)
            db.flush()
            db.add(Membership(room_id=gid, account_id=a.id, role='teacher', alias='教師', avatar='teacher', seat=None))
            gs = deepcopy(g.state)
            for seat, original in enumerate(assigned):
                mid = str(uuid5(UUID(gid), original.id))
                alias = original.alias.strip()
                if not alias or alias.startswith('~pending-'):
                    alias = f'學生 {rows.index(original) + 1}'
                m = Membership(id=mid, room_id=gid, account_id=original.account_id,
                    role='student', alias=alias, avatar=original.avatar, seat=seat, last_seen=original.last_seen)
                db.add(m)
                gs['members'][mid] = {**deepcopy(state['members'][original.id]),
                                      'alias': alias, 'seat': seat}
                mapping[original.id] = {'group_id': gid, 'membership_id': mid}
            gs['portal_group'] = initialise(gid, room.id, snap.id, list(gs['members']), f'Group {number+1}')
            gs['portal_group']['avatar_pack_id'] = cfg['avatar_pack_id']
            gs['portal_group']['asset_snapshot'] = deepcopy(asset_snapshot)
            machine = GameOrchestrator(gs, now)
            machine.command('start', {'script_document': snap.document}, None, True)
            persist_machine(db, g, machine)
            link_group_session(db, room, g)
            groups.append({'id': gid, 'number': number, 'label': f'Group {number+1}'})
        cfg.update(state='STARTED', groups=groups, mapping=mapping, snapshot_id=snap.id,
                   snapshot_sha=snap.content_hash, started_at=now, membership_snapshot=[r.id for r in rows])
        state.update(phase='group_overview', deadline_at=None, due_at=None)
        room.state, room.due_at = state, None
        append_event(db, room, {'type': 'groups.started', 'payload': {'group_count': len(groups), 'snapshot_id': snap.id}})
        return save_receipt(db, room, a, body, hashed,
                {'status': 'RECORDED', 'action_id': body.action_id, 'groups': groups, 'snapshot_id': snap.id, 'seq': room.seq})


@router.get('/classrooms/{rid}')
def view(rid: str, request: Request):
    with transaction() as db:
        a = actor(db, request)
        room, member, teacher = service.load(db, rid, a.id)
        if member is not None:
            member.last_seen = time.time()
            db.flush()
        state = service.hydrate(db, room)
        mode = 'teacher' if teacher and request.query_params.get('mode') == 'teacher' else 'student'
        if state.get('portal_group'):
            p = state['portal_group']
            visible_nodes, visible_edges = visible_evidence(p['arguments'],p['edges'],member.id if member else None,mode=='teacher')
            public_members = [{'id': mid, 'alias': m['alias']} for mid, m in state['members'].items()]
            return {'kind': 'GroupRun', 'id': rid, 'role': mode, 'seq': room.seq,
                'title': state['title'], 'phase': state['phase'], 'deadline_at': state['deadline_at'],
                'member_id': member.id if member else None, 'members': public_members,
                'runtime_mode': p['runtime_mode'], 'session_batch_id': p['classroom_id'], 'group_label': p['label'], 'classroom_id': p['classroom_id'],
                'question': state['questions'][state['question_index']] if state['question_index'] >= 0 else None,
                'transcript': [{'member_id': f['member_id'], 'messages': [{'role': x['role'], 'text': x['text']} for x in f['messages']]}
                               for run in state['runs'] for f in run['focuses']],
                'arguments': visible_nodes, 'edges': visible_edges, 'settlement': p['settlement'],
                'confirmed_members': list(p['confirmations']),
                'my_summary': person_summary(state, member.id) if member else None,
                'avatar_pack_id': p.get('avatar_pack_id', 'stickman'), 'source_mode': state['source_mode']}
        rows = roster(db, room)
        cfg = state.get('portal_classroom', {})
        if mode != 'teacher' and cfg.get('state') == 'STARTED':
            return {'kind': 'GroupCollection', 'id': rid, 'role': mode,
                    'route': cfg['mapping'].get(member.id, {}) if member else {}}
        if mode != 'teacher':
            return {'kind': 'Legacy', 'id': rid}
        groups = []
        for meta in cfg.get('groups', []):
            g = db.get(Room, meta['id'])
            if g:
                p = g.state['portal_group']
                groups.append({**meta, 'phase': g.state['phase'], 'members': len(p['member_snapshot']),
                    'acked': len(p['confirmations']), 'settlement': p['settlement']['state']})
        return {'kind': 'GroupCollection', 'id': rid, 'role': mode, 'title': state['title'],
                'phase': state['phase'], 'code': room.code if state['phase'] == 'lobby' else None,
                'roster': [{'id': r.id, 'alias': r.alias, 'group': cfg.get('assignments', {}).get(r.id)} for r in rows],
                'roster_digest': roster_hash(rows), 'configuration': {k: cfg.get(k) for k in
                    ['group_count', 'members_per_group', 'avatar_pack_id', 'revision']}, 'groups': groups}


@router.post('/runs/{rid}/commands')
def command(rid: str, body: GroupCommand, request: Request):
    if body.kind not in {'group_statement', 'group_ack', 'next'}:
        raise DomainError('GROUP_COMMAND_REQUIRED', 422)
    with transaction() as db:
        a = actor(db, request, True)
        room, _, _ = service.load(db, rid, a.id)
        if not room.state.get('portal_group'):
            raise DomainError('GROUP_RUN_REQUIRED', 422)
        return service.execute(db, a, rid, SimpleNamespace(**body.model_dump()))


@router.get('/classrooms/{rid}/analysis')
def analysis(rid: str, request: Request):
    with transaction() as db:
        a = actor(db, request)
        room = teacher_room(db, rid, a)
        cfg = room.state.get('portal_classroom', {})
        groups = [db.get(Room, x['id']) for x in cfg.get('groups', [])]
        return project_analysis(rid, room.state['title'], [g for g in groups if g])


@router.get('/runs/{rid}/members/{mid}/identity')
def identity(rid: str, mid: str, request: Request):
    with transaction() as db:
        a = actor(db, request)
        room, _, teacher = service.load(db, rid, a.id)
        if not teacher:
            raise DomainError('TEACHER_MEMBERSHIP_REQUIRED', 403)
        member = room.state['members'].get(mid)
        if member is None:
            raise DomainError('GROUP_MEMBER_REQUIRED', 404)
        return {'username': member['username'], 'scope': 'teacher_hover_only'}
