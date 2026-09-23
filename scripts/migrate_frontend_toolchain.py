"""Transform an owned candidate checkout; the original workspace remains intact."""
from pathlib import Path
import json, os, re, shutil

DEV = {
    '@rsbuild/core':'1.5.13', '@rsbuild/plugin-react':'1.4.1',
    'jest':'29.7.0', 'jest-environment-jsdom':'29.7.0', '@types/jest':'29.5.14',
    '@swc/jest':'0.2.39', '@swc/core':'1.13.5', '@types/node':'22.18.6',
    '@playwright/test':'1.56.1',
}
REMOVE = {'vite','vitest','@vitejs/plugin-react','@vitejs/plugin-react-swc','@vitest/coverage-v8','@vitest/ui'}

def migrate(repo: Path, overlay: Path) -> dict:
    changed=[]
    for src in sorted(overlay.rglob('*')):
        if src.is_file():
            rel=src.relative_to(overlay); dst=repo/rel
            dst.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(src,dst); changed.append(str(rel))
    f=repo/'frontend/package.json'; pkg=json.loads(f.read_text())
    for section in ['dependencies','devDependencies','optionalDependencies','peerDependencies']:
        for key in list(pkg.get(section,{})):
            if key in REMOVE or key.startswith('@vitejs/') or key.startswith('@vitest/'):
                pkg[section].pop(key)
    pkg.setdefault('dependencies',{})['@met4citizen/talkinghead']='1.7.0'
    pkg.setdefault('devDependencies',{}).update(DEV)
    pkg['scripts'].update(dev='rsbuild dev', build='tsc --noEmit && rsbuild build', preview='rsbuild preview', test='jest', typecheck='tsc --noEmit')
    f.write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n'); changed.append(str(f.relative_to(repo)))
    for pattern in ['vite.config.*','vitest.config.*']:
        for f in (repo/'frontend').glob(pattern):
            f.unlink(); changed.append(str(f.relative_to(repo)))
    # Tests preserve their assertions while moving runner primitives to Jest.
    for f in (repo/'frontend/src').rglob('*'):
        if f.suffix not in {'.ts','.tsx'}: continue
        s=f.read_text()
        if 'vitest' not in s and 'vite/client' not in s: continue
        rel=os.path.relpath(repo/'frontend/src/testkit',f.parent).replace(os.sep,'/')
        if not rel.startswith('.'): rel='./'+rel
        def convert(m):
            members=m.group(1)
            return f"import {{ vi }} from '{rel}'" if re.search(r'\bvi\b', members) else ''
        s=re.sub(r"import\s*\{([^}]+)\}\s*from\s*['\"]vitest['\"];?",convert,s)
        s=s.replace('@testing-library/jest-dom/vitest','@testing-library/jest-dom')
        s=s.replace('vite/client','@rsbuild/core/types').replace('vitest/globals','jest')
        f.write_text(s); changed.append(str(f.relative_to(repo)))
    f=repo/'frontend/tsconfig.json'
    cfg=json.loads(f.read_text()); opts=cfg.setdefault('compilerOptions',{})
    opts['types']=['jest','node','@rsbuild/core/types','@testing-library/jest-dom']
    opts['noEmit']=True
    f.write_text(json.dumps(cfg,indent=2)+'\n');changed.append(str(f.relative_to(repo)))
    for f in (repo/'.github/workflows').glob('*.yml'):
        s=f.read_text(); t=s.replace('npm test -- --run\n','npm test -- --runInBand\n')
        if s!=t: f.write_text(t); changed.append(str(f.relative_to(repo)))
    # Stage environment wiring is an application delivery parameter.
    stage_compose=repo/'deploy/stage/compose.yml'
    if stage_compose.exists():
        text=stage_compose.read_text()
        if 'host.docker.internal:host-gateway' not in text:
            text=text.replace('  backend:\n', '  backend:\n    extra_hosts:\n      - \"host.docker.internal:host-gateway\"\n',1)
            stage_compose.write_text(text);changed.append(str(stage_compose.relative_to(repo)))
    gi=repo/'.gitignore'
    old=gi.read_text() if gi.exists() else ''
    for item in ['.socrates-previous-release','deploy/stage/.env','deploy/local/.env']:
        if item not in old.splitlines():old+='\n'+item+'\n'
    gi.write_text(old)
    readme=repo/'README.md'
    old=readme.read_text() if readme.exists() else ''
    marker='<!-- SOCRATES_STAGE_OPERATOR -->'
    if marker not in old:
        old=marker+'\n## 伺服器組員：從這裡架設 Stage\n\n部署分支為 `stage`。完整步驟請讀 [Stage 部署指南](deploy/stage/README.md)。\n展示架構與講稿：[報告速記](docs/architecture/REPORT-BRIEF.zh-TW.md)。\n\n'+old
        readme.write_text(old);changed.append('README.md')
    # The former geometric avatar is retired; PortraitStage is the active renderer.
    old=repo/'frontend/src/features/conversation-room/avatar/AvatarStage.tsx'
    if old.exists(): old.unlink(); changed.append(str(old.relative_to(repo)))
    textinput=repo/'frontend/src/features/conversation-room/composer/TextInputAdapter.tsx'
    if textinput.exists():
        s=textinput.read_text()
        if '!event.nativeEvent.isComposing' not in s:
            s=s.replace("event.key === 'Enter' && !event.shiftKey", "event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing")
        textinput.write_text(s);changed.append(str(textinput.relative_to(repo)))
    # Documentation projects the new toolchain, keeping exact historical user artefacts in Loom custody.
    for name in ['README.md','docs/onboarding.md']:
        f=repo/name
        if f.exists():
            s=f.read_text();t=s.replace('Vite','Rsbuild').replace('vitest','Jest')
            if s!=t: f.write_text(t);changed.append(name)
    return {'changed_paths':sorted(set(changed)), 'toolchain':{'ui':'React','bundler':'Rsbuild','tests':'Jest/SWC'},'lockfile':'REGENERATE_WITH_NPM_ON_HOST'}
