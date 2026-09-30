"""R70 GroupRun extension for the existing GameOrchestrator.

The native service retains authentication, row locks, event storage and worker
ownership. This module adds quoted evidence, per-member confirmation and one
complete final reflection phase. Source text remains attributed to its author.
"""
from copy import deepcopy
from hashlib import sha256
import json
from uuid import uuid4

EDGE_TYPES = frozenset({'supports', 'challenges', 'qualifies', 'revises'})
TALK_PHASES = frozenset({'answering', 'distribution', 'arena', 'focus', 'focus_summary',
                         'question_summary', 'preview', 'viewpoint_review', 'final_reflection'})


def fingerprint(value):
    return sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                             separators=(',', ':')).encode()).hexdigest()


def initialise(group_id, parent_id, snapshot_id, members, label):
    return {'revision': 73, 'kind': 'GroupRun', 'id': group_id, 'classroom_id': parent_id,
            'label': label, 'snapshot_id': snapshot_id, 'member_snapshot': list(members),
            'runtime_mode': 'native-group-stage',
            'arguments': [], 'edges': [], 'confirmations': {},
            'settlement': {'state': 'EXPLORING'}, 'source_mode': 'native-provider'}


def person_summary(state, member_id):
    p = state['portal_group']
    rows = [n for n in p['arguments'] if n['member_id'] == member_id and n['kind'] != 'confirmed_viewpoint']
    summary = {'group_id': p['id'], 'member_id': member_id,
               'quotes': [{'id': n['id'], 'text': n['text'], 'stage': n['stage']} for n in rows]}
    return {**summary, 'digest': fingerprint(summary)}


def record_statement(state, member_id, text, now, *, relation='qualifies', parents=(), node_id=None):
    from .orchestrator import DomainError
    p = state['portal_group']
    if member_id not in p['member_snapshot']:
        raise DomainError('GROUP_MEMBERSHIP_REQUIRED', 403)
    if state['phase'] not in TALK_PHASES:
        raise DomainError('DIALOGUE_PHASE_REQUIRED', 409)
    if not isinstance(text, str) or not isinstance(parents, (list, tuple)) or any(not isinstance(x, str) for x in parents):
        raise DomainError('TYPED_STATEMENT_AND_PARENT_IDS_REQUIRED', 422)
    text = text.strip()
    if not 1 <= len(text) <= 12000:
        raise DomainError('STATEMENT_LENGTH_1_TO_12000', 422)
    if relation not in EDGE_TYPES:
        raise DomainError('ARGUMENT_RELATION_REQUIRED', 422)
    known = {n['id'] for n in p['arguments'] if n.get('member_id') == member_id or n.get('visibility') in {'stage','group_shared'}}
    if any(x not in known for x in parents) or len(parents) > 8:
        raise DomainError('EXISTING_GROUP_ARGUMENT_REQUIRED', 422)
    nid = node_id or str(uuid4())
    if nid in known:
        raise DomainError('FRESH_ARGUMENT_ID_REQUIRED', 409)
    # Every edge leads from an existing node to a new node: DAG by construction.
    node = {'id': nid, 'member_id': member_id, 'text': text, 'at': float(now),
            'sequence': len(p['arguments']), 'stage': state['phase'],
            'question_index': state['question_index'],
            'kind': 'post_ack_observation' if member_id in p['confirmations'] else 'statement',
            'provenance': 'student_original_quote', 'visibility': 'personal'}
    p['arguments'].append(node)
    p['edges'].extend({'source': source, 'target': nid, 'type': relation,
                       'provenance': 'student_selected_relation'} for source in dict.fromkeys(parents))
    return node


def confirm(state, member_id, digest, now):
    from .orchestrator import DomainError
    p = state['portal_group']
    if member_id not in p['member_snapshot']:
        raise DomainError('GROUP_MEMBERSHIP_REQUIRED', 403)
    if state['phase'] not in TALK_PHASES:
        raise DomainError('CONFIRMABLE_PHASE_REQUIRED', 409)
    summary = person_summary(state, member_id)
    if not summary['quotes']:
        raise DomainError('QUOTED_VIEWPOINT_REQUIRED', 409)
    if digest != summary['digest']:
        raise DomainError('CURRENT_SUMMARY_DIGEST_REQUIRED', 409)
    if member_id in p['confirmations']:
        return p['confirmations'][member_id]
    record = {'member_id': member_id, 'summary_digest': digest, 'summary': summary,
              'at': float(now), 'authority': 'student_explicit_confirmation'}
    p['confirmations'][member_id] = record
    nid = str(uuid4())
    p['arguments'].append({'id': nid, 'member_id': member_id,
        'text': summary['quotes'][-1]['text'], 'at': float(now), 'sequence': len(p['arguments']),
        'kind': 'confirmed_viewpoint', 'stage': state['phase'],
        'question_index': state['question_index'], 'summary_digest': digest,
        'provenance': 'student_explicit_confirmation'})
    p['edges'].append({'source': summary['quotes'][-1]['id'], 'target': nid,
                       'type': 'qualifies', 'provenance': 'confirmation_snapshot'})
    if p['member_snapshot'] and all(m in p['confirmations'] for m in p['member_snapshot']):
        p['settlement'] = {'state': 'CURRENT_PHASE_FINISHING', 'latched_at': float(now),
                           'latched_phase': state['phase'], 'final_stage_count': 0}
        if state.get('due_at') is None:
            state['due_at'] = now + 30
            state['deadline_at'] = now + 30
    return record


def extend(Native):
    """Install one additive subclass at the native orchestrator module boundary."""
    class StageBoundary(Exception):
        pass

    class GroupOrchestrator(Native):
        def group(self):
            return self.s.get('portal_group')

        def individual(self):
            return bool(self.group()) and self.group().get('runtime_mode') == 'individual-free-text'

        def job(self, kind, key, context):
            if self.individual() and kind == 'dynamic_question':
                context = {**context, 'group_id': self.group()['id'],
                    'quoted_viewpoints': [n['text'] for n in self.group()['arguments'][-30:]],
                    'representatives': [{'option_id': f['option_id'], 'argument': f['argument'],
                        'discussion': f['messages'], 'micro_summary': f.get('micro_summary', '')}
                        for f in self.current()['focuses']]}
            return Native.job(self, kind, key, context)

        def phase(self, name, seconds=None):
            p = self.group()
            if p and name != self.s['phase']:
                settlement = p['settlement']
                if settlement['state'] == 'CURRENT_PHASE_FINISHING':
                    settlement.update(state='FINAL_STAGE', started_at=self.now,
                                      final_stage_count=1)
                    self.s['focus'] = None
                    self.s['pending_generation'] = None
                    # Successor provider calls are represented by a later run.
                    self.jobs = [j for j in self.jobs if j['kind'].endswith('summary')]
                    Native.phase(self, 'final_reflection', 60)
                    self.emit('group.final_stage.started', group_id=p['id'])
                    raise StageBoundary()
                if name == 'summary' and settlement['state'] == 'EXPLORING':
                    Native.phase(self, 'viewpoint_review')
                    self.emit('group.viewpoint_review', group_id=p['id'])
                    raise StageBoundary()
            return Native.phase(self, name, seconds)

        def settle(self):
            p = self.group()
            if p['settlement']['state'] != 'FINAL_STAGE':
                from .orchestrator import DomainError
                raise DomainError('COMPLETE_FINAL_STAGE_REQUIRED', 409)
            p['settlement'].update(state='SETTLED', settled_at=self.now)
            self.s['focus'] = None
            self.s['pending_generation'] = None
            self.s['closed_at'] = self.now
            if self.s.get('runs'):
                self.current()['phase'] = 'complete'
            Native.phase(self, 'summary')
            # Deterministic, attributed evidence is immediately readable.
            self.s['summaries']['class'] = {
                'status': 'READY', 'text': '本組原話、觀點確認與後續補充已保存。',
                'key_points': [self.s['members'][m]['alias'] + '：' +
                               p['confirmations'][m]['summary']['quotes'][-1]['text']
                               for m in p['member_snapshot']],
                'provenance': {'provider': 'student_confirmed_quote_projection'}}
            self.emit('group.settled', group_id=p['id'],
                      confirmation_digests={m: c['summary_digest'] for m, c in p['confirmations'].items()})

        def command(self, kind, data, member_id, teacher):
            p = self.group()
            if not p:
                return Native.command(self, kind, data, member_id, teacher)
            from .orchestrator import DomainError
            try:
                if kind == 'group_statement':
                    node = record_statement(self.s, member_id, data.get('text', ''), self.now,
                        relation=data.get('relation', 'qualifies'), parents=data.get('parents', []))
                    self.emit('group.statement', argument_id=node['id'], member_id=member_id)
                    if self.individual() and self.s.get('runs'):
                        run = self.current()
                        if member_id not in run['answers'] and self.s['phase'] == 'answering':
                            run['answers'][member_id] = {'option_id': '__expressed__',
                                'argument': node['text'], 'submitted_at': self.now,
                                'via': 'free-text', 'revision': 1}
                        if self.s['phase'] == 'answering':
                            self.emit('group.answer.saved', member_id=member_id)
                        elif self.s['phase'] == 'focus':
                            focus = self.focus()
                            if focus and focus['member_id'] == member_id and focus['status'] == 'AWAITING_STUDENT':
                                Native.command(self, 'focus_message', {'text': node['text']}, member_id, teacher)
                    return
                if kind == 'group_ack':
                    ack = confirm(self.s, member_id, data.get('summary_digest'), self.now)
                    self.emit('group.viewpoint.confirmed', member_id=member_id, summary_digest=ack['summary_digest'])
                    return
                if self.s['phase'] == 'final_reflection' and kind == 'next':
                    if not teacher:
                        raise DomainError('TEACHER_MEMBERSHIP_REQUIRED', 403)
                    return self.settle()
                if self.s['phase'] == 'viewpoint_review' and kind == 'next':
                    if not teacher:
                        raise DomainError('TEACHER_MEMBERSHIP_REQUIRED', 403)
                    if p['settlement']['state'] == 'CURRENT_PHASE_FINISHING':
                        self.phase('final_reflection', 60)
                    return
                if kind in {'answer', 'focus_message'} and data.get('text', '').strip():
                    node = record_statement(self.s, member_id, data['text'], self.now)
                    if kind == 'focus_message': node['visibility'] = 'stage'
                    self.emit('group.statement', argument_id=node['id'], member_id=member_id)
                return Native.command(self, kind, data, member_id, teacher)
            except StageBoundary:
                return

        def finalize(self):
            if not self.individual():
                return Native.finalize(self)
            run = self.current()
            run['phase'] = 'distribution'
            run['distribution'] = []
            self.phase('distribution', 3)

        def next_focus(self):
            if not self.individual():
                result = Native.next_focus(self)
                focus = self.focus() if self.s.get('focus') else None
                if focus and self.group():
                    for node in self.group()['arguments']:
                        if node['member_id'] == focus['member_id'] and node['question_index'] == self.s['question_index'] and node['text'] == focus['argument']:
                            node['visibility'] = 'stage'
                return result
            run = self.current()
            covered = run.setdefault('covered_members', [])
            member = next((m for m in self.group()['member_snapshot']
                           if m not in covered and m in run['answers']), None)
            if member is None:
                return self.finish_question()
            covered.append(member)
            run['covered_options'].append(member)
            focus = {'id': str(uuid4()), 'member_id': member, 'option_id': member,
                     'argument': run['answers'][member]['argument'], 'messages': [],
                     'turn_index': 0, 'completed_turns': 0, 'status': 'GENERATING',
                     'advance_requested': False, 'micro_summary': '', 'last_observations': {},
                     'offline_comment': False}
            run['focuses'].append(focus)
            self.s['focus'] = focus['id']
            self.phase('focus')
            self.queue_tutor(focus)

        def tick(self):
            p = self.group()
            if not p:
                return Native.tick(self)
            try:
                if self.s.get('due_at') is not None and self.now >= self.s['due_at']:
                    if self.s['phase'] == 'final_reflection':
                        return self.settle()
                    if p['settlement']['state'] == 'CURRENT_PHASE_FINISHING' and self.s['phase'] in {'viewpoint_review', 'question_summary', 'arena'}:
                        self.phase('final_reflection', 60)
                return Native.tick(self)
            except StageBoundary:
                return

        def complete_job(self, kind, key, result, provider):
            try:
                return Native.complete_job(self, kind, key, result, provider)
            except StageBoundary:
                return

    GroupOrchestrator.__name__ = 'GameOrchestrator'
    return GroupOrchestrator
