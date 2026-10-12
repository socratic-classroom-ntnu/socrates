#!/usr/bin/env python3
from __future__ import annotations
import json, sys, urllib.request, uuid

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8000/api'
LEARNER = str(uuid.uuid4())

def req(method, path, body=None):
    raw = None if body is None else json.dumps(body, ensure_ascii=False).encode()
    request = urllib.request.Request(BASE + path, data=raw, method=method, headers={'Content-Type':'application/json','X-Learner-Id':LEARNER})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode())

assert req('GET','/health')['status'] == 'ok'
created=req('POST','/sessions',{'ladder_id':'trolley','restart_existing':False}); sid=created['session']['id']
inputs=[
 '我會轉向。',
 '因為這樣只會死一個人，比五個人少。',
 '若岔道有一百人而直行只撞一人，我就不會轉；我的原則仍是減少死亡。',
]
for text in inputs: req('POST',f'/sessions/{sid}/messages',{'text':text})
detail=req('GET',f'/sessions/{sid}')
if 'advance' in detail['available_actions']: req('POST',f'/sessions/{sid}/advance',{})
req('POST',f'/sessions/{sid}/end',{})
summary=req('POST',f'/sessions/{sid}/summary',{})
assert summary['discussion_topic']
assert isinstance(summary['key_points'], list)
history=req('GET','/sessions?limit=30')
assert any(item['id']==sid for item in history['items'])
release=req('GET','/release')
print(json.dumps({'session_id':sid,'summary':summary,'history_count':len(history['items']),'release':release},ensure_ascii=False))
