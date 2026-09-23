#!/usr/bin/env python3
"""Real two-worker PostgreSQL workload; requires the dedicated ephemeral CI DB.

Creates isolated fixture accounts directly in that test DB, then uses real HTTP
commands and 122 WebSockets. Production databases stay outside this workload.
"""
import argparse
import asyncio
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
from uuid import uuid4
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
import httpx
import websockets
from sqlalchemy import select
from app.run2.auth import COOKIE, HASHER
from app.run2.contracts import Command, JoinRoom, ScriptDocument
from app.run2 import service, storage

DOC=ScriptDocument.model_validate({'title':'Run2 2×60 同步驗收','questions':[{'id':'q1','title':'共同抉擇','scenario':'你會優先保護哪一種價值？','duration_seconds':60,'max_focus_turns':1,'focus_response_seconds':5,'options':[{'id':'a','text':'結果'},{'id':'b','text':'責任'},{'id':'c','text':'關係'}]}],'live_llm_call_budget':0}).model_dump()

def fixtures():
    url=os.environ['DATABASE_URL']
    if not url.rsplit('/',1)[-1].split('?')[0].endswith('_load'):
        raise RuntimeError('Use a dedicated database whose name ends with _load')
    storage.configure(url,create=True)
    identities=[];room_ids=[]
    pw=HASHER.hash('Fixture-password-2026')
    with storage.transaction() as db:
        for ri in range(2):
            a=storage.Account(id=str(uuid4()),username=f'load-teacher-{uuid4().hex}',email=f'{uuid4().hex}@example.invalid',password_hash=pw,verified=True)
            db.add(a);db.flush()
            s=storage.Script(id=str(uuid4()),owner_id=a.id,document=DOC,revision=1);db.add(s);db.flush()
            room=service.create_room(db,a,s.id);room_ids.append(room['id'])
            token=str(uuid4());csrf=str(uuid4())
            db.add(storage.LoginSession(token_hash=storage.digest(token),account_id=a.id,csrf_token=csrf,expires_at=time.time()+3600))
            identities.append({'room':room['id'],'account':a.id,'member':None,'role':'teacher','token':token,'csrf':csrf})
            for n in range(60):
                a=storage.Account(id=str(uuid4()),username=f'load-student-{uuid4().hex}',email=f'{uuid4().hex}@example.invalid',password_hash=pw,verified=True);db.add(a);db.flush()
                joined=service.join(db,a,JoinRoom(code=room['code'],alias=f'同學{n+1}'))
                token=str(uuid4());csrf=str(uuid4())
                db.add(storage.LoginSession(token_hash=storage.digest(token),account_id=a.id,csrf_token=csrf,expires_at=time.time()+3600))
                identities.append({'room':room['id'],'account':a.id,'member':joined['member_id'],'role':'student','token':token,'csrf':csrf,'option':['a','b','c'][n%3]})
    return identities,room_ids

async def workload(items,room_ids):
    conns=[];stats={'rooms':2,'students_per_room':60,'teachers':2,'websockets':0,'answers':0,'idempotent_replays':0,'event_room_isolation':True};clients=[]
    try:
        for item in items:
            client=httpx.AsyncClient(base_url='http://127.0.0.1:8099',headers={'X-CSRF-Token':item['csrf'],'Origin':'http://127.0.0.1:8099'},cookies={COOKIE:item['token']},timeout=20)
            clients.append((item,client))
            ws=await websockets.connect(f'ws://127.0.0.1:8099/api/v2/classrooms/{item["room"]}/ws?mode={item["role"]}',additional_headers={'Cookie':COOKIE+'='+item['token'],'Origin':'http://127.0.0.1:8099'},max_size=5_000_000)
            conns.append((item,ws));stats['websockets']+=1
            got=False
            for _ in range(5):
                msg=json.loads(await asyncio.wait_for(ws.recv(),10))
                if msg['type']=='snapshot':
                    assert msg['room']['id']==item['room'];got=True;break
            assert got
        for item,c in clients:
            if item['role']=='teacher':
                response=await c.post(f'/api/v2/classrooms/{item["room"]}/commands',json={'action_id':str(uuid4()),'kind':'start','data':{}});response.raise_for_status()
        # Observe authoritative questions rather than guessing a timer schedule.
        for _ in range(100):
            ready=True
            for item,c in clients:
                if item['role']=='teacher':
                    v=(await c.get(f'/api/v2/classrooms/{item["room"]}')).json()
                    if v['phase']!='answering':ready=False
            if ready:break
            await asyncio.sleep(0.1)
        assert ready
        durations=[]
        async def submit(item,c):
            if item['role']!='student':return
            view=(await c.get(f'/api/v2/classrooms/{item["room"]}')).json()
            data={'action_id':str(uuid4()),'kind':'answer','data':{'question_run_id':view['question_run_id'],'option_id':item['option'],'text':'我選擇此立場，因為我重視其倫理原則。','revision':1}}
            start=time.perf_counter();r=await c.post(f'/api/v2/classrooms/{item["room"]}/commands',json=data);r.raise_for_status();durations.append((time.perf_counter()-start)*1000)
            again=await c.post(f'/api/v2/classrooms/{item["room"]}/commands',json=data);again.raise_for_status();assert r.json()==again.json()
        await asyncio.gather(*(submit(i,c) for i,c in clients))
        with storage.transaction() as db:
            for room_id in room_ids:
                rows=db.scalars(select(storage.Answer).where(storage.Answer.room_id==room_id)).all()
                assert len(rows)==60;assert len({(x.question_run_id,x.membership_id) for x in rows})==60
                stats['answers']+=len(rows)
        stats['idempotent_replays']=120
        # Capture per-client event arrival; public-latency objectives remain measured values.
        event_times={}
        async def drain(item,ws):
            for _ in range(2000):
                try:msg=json.loads(await asyncio.wait_for(ws.recv(),0.3))
                except asyncio.TimeoutError:return
                if msg.get('durable') and msg.get('type')=='phase.changed':
                    key=(item['room'],msg['seq']);event_times.setdefault(key,[]).append(time.perf_counter())
                if msg.get('type')=='snapshot':assert msg['room']['id']==item['room']
        await asyncio.gather(*(drain(i,w) for i,w in conns))
        ds=sorted(durations);stats.update(http_p50_ms=ds[len(ds)//2],http_p95_ms=ds[int(len(ds)*.95)],measurement='HTTP_COMMAND_LATENCY_AND_EVENT_CUSTODY')
        # A disconnected member reconnects with existing identity and receives a current snapshot.
        item,_=conns[1]
        async with websockets.connect(f'ws://127.0.0.1:8099/api/v2/classrooms/{item["room"]}/ws?last_seq=0',additional_headers={'Cookie':COOKIE+'='+item['token'],'Origin':'http://127.0.0.1:8099'}) as ws:
            data=json.loads(await ws.recv());assert data['type']=='replay'
            data=json.loads(await ws.recv());assert data['type']=='snapshot';assert data['room']['member_id']==item['member']
        stats['reconnect_snapshot']='PASS';stats['state']='PASS'
        return stats
    finally:
        await asyncio.gather(*(w.close() for _,w in conns),return_exceptions=True)
        await asyncio.gather(*(c.aclose() for _,c in clients),return_exceptions=True)

def main():
    p=argparse.ArgumentParser();p.add_argument('--output',default='run2-load.json');args=p.parse_args()
    items,rooms=fixtures();env={**os.environ,'PYTHONPATH':str(ROOT/'backend')}
    # This dedicated entry only exists in the test process.
    entry=ROOT/'backend/run2_load_entry.py';entry.write_text('from app.run2.server import create_app\napp=create_app()\n')
    with open('run2-server.log','w') as log:
        process=subprocess.Popen([sys.executable,'-m','uvicorn','run2_load_entry:app','--host','127.0.0.1','--port','8099','--workers','2'],cwd=ROOT/'backend',env=env,stdout=log,stderr=log)
        try:
            for _ in range(100):
                try:
                    if httpx.get('http://127.0.0.1:8099/api/v2/readiness').status_code==200:break
                except httpx.HTTPError:pass
                time.sleep(.1)
            result=asyncio.run(workload(items,rooms));Path(args.output).write_text(json.dumps(result,indent=2)+'\n')
            print(json.dumps(result));return 0
        except Exception as exc:
            Path(args.output).write_text(json.dumps({'state':'ERROR','error_type':type(exc).__name__,'detail':str(exc)},indent=2)+'\n');raise
        finally:
            process.terminate()
            try:process.wait(timeout=10)
            except subprocess.TimeoutExpired:process.kill();process.wait()
            entry.unlink(missing_ok=True)
if __name__=='__main__':main()
