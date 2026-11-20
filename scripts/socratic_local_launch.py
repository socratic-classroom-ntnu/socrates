#!/usr/bin/env python3
"""Domain-owned local launcher: current worktree, bounded Compose, durable receipt."""
from __future__ import annotations
import argparse, fcntl, hashlib, json, os, pathlib, signal, subprocess, sys, time, urllib.request

def write(path, value):
    p=pathlib.Path(path);p.parent.mkdir(parents=True,exist_ok=True)
    tmp=p.with_suffix(p.suffix+'.part');tmp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');tmp.replace(p)

_children=set()
def _stop(signum,frame):
    for pid in list(_children):
        try:os.killpg(pid,signal.SIGTERM)
        except ProcessLookupError:pass
    raise KeyboardInterrupt()
signal.signal(signal.SIGTERM,_stop)
signal.signal(signal.SIGINT,_stop)

def command(argv, cwd, log, timeout, env=None):
    with pathlib.Path(log).open('w') as out:
        p=subprocess.Popen(argv,cwd=cwd,stdout=out,stderr=subprocess.STDOUT,start_new_session=True,env={**os.environ,**(env or {})})
        _children.add(p.pid)
        try:
            code=p.wait(timeout)
        except (subprocess.TimeoutExpired,KeyboardInterrupt):
            os.killpg(p.pid,signal.SIGTERM)
            try:p.wait(8)
            except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
            raise RuntimeError('COMMAND_DEADLINE_RECONCILE '+argv[0])
        finally:
            _children.discard(p.pid)
        if code:raise RuntimeError('COMMAND_RESULT '+str(code)+'; log='+str(log))

def http(url):
    try:
        with urllib.request.urlopen(url,timeout=3) as r:return {'status':r.status,'body':r.read(65536).decode()}
    except Exception as exc:return {'status':None,'detail':type(exc).__name__}

def source_identity(repo):
    def git(*args):return subprocess.check_output(['git','-C',str(repo),*args],text=True,timeout=15).strip()
    sha=git('rev-parse','HEAD');digest=hashlib.sha256()
    for name in sorted(git('ls-files','--cached','--others','--exclude-standard','-z').split('\0')):
        p=repo/name
        if not name or not p.is_file() or p.is_symlink():continue
        if any(x in p.parts for x in ['node_modules','__pycache__','dist','.ruff_cache','.mypy_cache','.pytest_cache']):continue
        if p.name.startswith('.env') and p.name!='.env.example':continue
        digest.update(name.encode()+b'\0'+p.read_bytes()+b'\0')
    return {'commit':sha,'worktree_sha256':digest.hexdigest(),'root':str(repo),'branch':git('branch','--show-current')}

def launch(config_path, operation='ensure', open_browser=False):
    config=json.loads(pathlib.Path(config_path).read_text());repo=pathlib.Path(config['repo']).resolve()
    state=pathlib.Path(config.get('state_dir',str(pathlib.Path.home()/'.local/state/bh-socratic/local')))
    state.mkdir(parents=True,exist_ok=True)
    port=int(config['port']);url='http://127.0.0.1:'+str(port)
    result={'schema':'socrates/local-launch/v2','machine':'arthur.wsl','url':url,'state':'STARTING','started_at':time.time()}
    with (state/'launch.lock').open('w') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            try:current=json.loads((state/'receipt.json').read_text())
            except Exception:current=result
            return {**current,'state':'STARTING','reason':'EXISTING_LAUNCH_OWNER'}
        try:
            source=source_identity(repo);result['source']=source
            result['project']=config.get('project','socrates-local')
            write(state/'receipt.json',result)
            compose=['docker','compose','-p',result['project'],'-f',str(repo/'deploy/local/compose.yml')]
            env={'SOCRATES_LOCAL_PORT':str(port),'SOCRATES_SOURCE_SHA':source['commit'],'SOCRATES_WORKTREE_SHA256':source['worktree_sha256']}
            if operation=='ensure':
                # Existing project and volumes are retained; HMR/reload serve the worktree.
                command(compose+['up','-d','--build'],repo,state/'compose-up.log',config.get('build_timeout',600),env)
            deadline=time.monotonic()+(config.get('ready_timeout',180) if operation=='ensure' else 1)
            while True:
                health=http(url+'/api/v2/readiness');root=http(url)
                if health.get('status')==200 and root.get('status')==200:
                    result.update(state='READY',health=health,root=root,release=http(url+'/api/release'));break
                if time.monotonic()>=deadline:result.update(state='AWAITING_READINESS',health=health,root=root);break
                time.sleep(2)
            if result['state']=='READY' and open_browser:
                executable='/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
                if pathlib.Path(executable).is_file():
                    command([executable,'-NoProfile','-Command',"Start-Process '"+url+"'"],repo,state/'browser.log',15)
                    result['browser_open_requested']=True
            result['source_observed_after_start']=source_identity(repo)
            result['finished_at']=time.time();write(state/'receipt.json',result)
        except (Exception,KeyboardInterrupt) as exc:
            result.update(state='UNKNOWN' if 'RECONCILE' in str(exc) else 'ERROR',detail=str(exc),finished_at=time.time())
            write(state/'receipt.json',result)
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('operation',choices=['ensure','status'],nargs='?',default='ensure');p.add_argument('--config',default=str(pathlib.Path.home()/'.config/bh-socratic/local.json'));p.add_argument('--open',action='store_true');a=p.parse_args()
    try:r=launch(a.config,a.operation,a.open)
    except Exception as e:r={'state':'ERROR','detail':str(e)}
    print(json.dumps(r,ensure_ascii=False));sys.exit(0 if r['state']=='READY' else 75)
