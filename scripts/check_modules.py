#!/usr/bin/env python3
"""模組地圖檢查：前後端各自模組化，兩端只透過契約接。

地圖在 docs/modules/modules.json（後端模組、前端模組、契約）。檢查四件事：
1. 覆蓋：backend/app 的每個原始碼檔屬於且只屬於一個後端模組；frontend/src 的屬於一個前端模組（最長路徑前綴）。
2. 依賴：跨模組 import 只能指向該模組 uses 列出的模組（uses 含 "*" 的是組裝層）。
3. 後端：跨模組只 import 對方的 contracts／service／repositories（platform 是基礎建設，不限）；
   route 檔不 import 其他 route 檔；不用 import_module 動態載入；ORM 只定義在 repositories（組裝層除外）。
4. 前端：網路呼叫（fetch）與 WebSocket 只在 contract/（對接模組）。

目前尚未清掉的違規逐條列在 docs/modules/violations.json：清單只能變短——新違規會失敗，
已修好的違規還留在清單上也會失敗（請把那一行刪掉）。PR 的 CI 另以 `--baseline-ref origin/<base>` 比對 base 分支
（依種類／模組對計數，搬檔改路徑不算新違規）。後端 import 以 ast 解析（含相對 import、有程式碼的 __init__.py；docstring 不算）。`--write` 依地圖重寫 README 的模組表與各模組文件的 Scope 段。
"""

from __future__ import annotations

import ast
import json
import os
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs/modules"
MAP = DOCS / "modules.json"
BASELINE = DOCS / "violations.json"
SKIP = re.compile(r"(\.test\.[jt]sx?$|__init__\.py$|\.d\.mts$|\.css$|/invariants/|/test-fixtures/)")
STATUS = {"ok": "✅", "warn": "⚠️", "block": "❌"}
BEGIN, END = "<!-- module-map:begin -->", "<!-- module-map:end -->"
SIDES = {"backend": "backend/app", "frontend": "frontend/src"}
TS_EXT = ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"]


PUBLIC_FILES = ("/contracts.py", "/service.py", "/repositories.py")


def is_route(path: str) -> bool:
    return path.endswith(("/routes.py", "_routes.py")) or "/routes/" in path


def has_code(path: str) -> bool:
    """__init__.py 只有 docstring 或空白時不算原始碼；有任何敘述就納入檢查。"""
    body = ast.parse((ROOT / path).read_text(encoding="utf-8")).body
    if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
        body = body[1:]
    return bool(body)


def tracked(side: str) -> list[str]:
    out = subprocess.check_output(["git", "ls-files", SIDES[side]], cwd=ROOT, text=True)
    keep = (".py",) if side == "backend" else (".ts", ".tsx", ".mjs")
    files = [f for f in out.split() if f.endswith(keep)]
    return [f for f in files if not SKIP.search(f) or (side == "backend" and f.endswith("__init__.py") and has_code(f))]


def owner_of(path: str, modules: list[dict]) -> list[str]:
    best, owners = -1, []
    for module in modules:
        for prefix in module["paths"]:
            hit = path == prefix or (prefix.endswith("/") and path.startswith(prefix))
            if hit and len(prefix) > best:
                best, owners = len(prefix), [module["id"]]
            elif hit and len(prefix) == best:
                owners.append(module["id"])
    return owners


def module_file(dotted: str) -> str | None:
    """app.x.y → backend/app/x/y.py 或 backend/app/x/y/__init__.py（後者要有程式碼才算依賴）。"""
    base = "backend/" + dotted.replace(".", "/")
    if (ROOT / (base + ".py")).exists():
        return base + ".py"
    init = base + "/__init__.py"
    if (ROOT / init).exists() and has_code(init):
        return init
    return None


def imported_modules(path: str, tree: ast.Module) -> list[str]:
    """以 ast 讀出 import 的模組（from 的名稱當子模組候選）；相對 import 依檔案位置還原；docstring 不算。"""
    package = path[len("backend/") : -len(".py")].split("/")[:-1]
    found: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found += [alias.name for alias in node.names]
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                anchor = package[: len(package) - (node.level - 1)] if node.level > 1 else package
                base = ".".join(anchor + ([node.module] if node.module else []))
            else:
                base = node.module or ""
            found.append(base)
            found += [f"{base}.{alias.name}" for alias in node.names if alias.name != "*"]
    return [m for m in found if m == "app" or m.startswith("app.")]


def py_targets(path: str, tree: ast.Module) -> list[str]:
    found = {module_file(m) for m in imported_modules(path, tree)}
    return sorted(t for t in found if t and t != path)


def defines_table(tree: ast.Module) -> bool:
    """class 內有 __tablename__ = …（含 `__tablename__: ClassVar[str] = …`）就是 ORM 定義。"""
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "__tablename__" for t in node.targets):
            return True
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.target.id == "__tablename__":
            return True
    return False


def calls_import_module(tree: ast.Module) -> bool:
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            fn = node.func
            if (isinstance(fn, ast.Name) and fn.id == "import_module") or (isinstance(fn, ast.Attribute) and fn.attr == "import_module"):
                return True
    return False



def ts_targets(path: str, text: str) -> list[str]:
    found = []
    for spec in re.findall(r"""(?:from|import)\s*\(?\s*['"](\.{1,2}/[^'"]+)['"]""", text):
        base = os.path.normpath(os.path.join(os.path.dirname(path), spec))
        for ext in TS_EXT:
            if (ROOT / (base + ext)).is_file():
                found.append(base + ext)
                break
    return found


def violations(spec: dict) -> tuple[list[str], dict[str, list[str]]]:
    problems: list[str] = []
    found: dict[str, list[str]] = {"backend": [], "frontend": []}
    for side in SIDES:
        modules = spec[side]
        by_id = {m["id"]: m for m in modules}
        for module in modules:
            for prefix in module["paths"]:
                if not (ROOT / prefix).exists():
                    problems.append(f"{side}/{module['id']}: {prefix} 不存在")
        for path in tracked(side):
            owners = owner_of(path, modules)
            if len(owners) != 1:
                problems.append(f"{path}：{'沒有歸屬模組' if not owners else '同時屬於 ' + ', '.join(owners)}")
                continue
            me = by_id[owners[0]]
            text = (ROOT / path).read_text(encoding="utf-8")
            tree = ast.parse(text) if side == "backend" else None
            targets = py_targets(path, tree) if tree is not None else ts_targets(path, text)
            for target in sorted(set(targets)):
                if SKIP.search(target):
                    continue
                other = owner_of(target, modules)
                if other and other[0] != me["id"] and "*" not in me["uses"] and other[0] not in me["uses"]:
                    found[side].append(f"{me['id']}→{other[0]}  {path} → {target}")
            if side == "backend":
                assembly = "*" in me["uses"]
                for target in sorted(set(targets)):
                    other = owner_of(target, modules)
                    if not other or other[0] == me["id"] or assembly or other[0] == "platform":
                        continue
                    # 跨模組只能用對方公開的三個檔：contracts（型別）、service（用例）、repositories（ORM 列）
                    if not target.endswith(PUBLIC_FILES + ("/__init__.py",)):
                        found[side].append(f"private-import  {path} → {target}")
                if is_route(path) and not assembly:
                    for target in set(targets):
                        if is_route(target) and target != path:
                            found[side].append(f"route-imports-route  {path} → {target}")
                if not assembly and tree is not None and calls_import_module(tree):
                    found[side].append(f"dynamic-import  {path}")
                if "/repositories/" not in path and not path.endswith("/repositories.py") and not path.endswith("/interaction_repositories.py") and tree is not None and defines_table(tree):
                    found[side].append(f"orm-outside-repositories  {path}")
            elif not path.startswith("frontend/src/contract/"):
                if re.search(r"(?<![\w.])fetch\(", text):
                    found[side].append(f"fetch-outside-contract  {path}")
                if re.search(r"\bnew\s+WebSocket\(", text):
                    found[side].append(f"websocket-outside-contract  {path}")
    return problems, {k: sorted(set(v)) for k, v in found.items()}


def table(spec: dict, side: str, current: dict[str, list[str]]) -> str:
    owner = spec["owners"][side]
    rows = [f"| 模組 | 邊界 | 檔案範圍 | 可依賴 | 待清違規 |", "|---|---|---|---|---|"]
    for m in spec[side]:
        n = len(module_violations(m, side, current, spec))
        scope = "<br>".join(f"`{p}`" for p in m["paths"])
        uses = "全部（組裝層）" if "*" in m["uses"] else ("、".join(m["uses"]) or "—")
        rows.append(f"| [{m['name']}](./{side}/{m['id']}.md) | {STATUS[m['status']]} | {scope} | {uses} | {n} |")
    return f"**{'後端' if side == 'backend' else '前端'}模組**（default owner：{owner}）\n\n" + "\n".join(rows)


def module_violations(m: dict, side: str, current: dict[str, list[str]], spec: dict) -> list[str]:
    out = []
    for v in current[side]:
        head, _, rest = v.partition("  ")
        source = rest.split(" → ")[0]
        if head.split("→")[0] == m["id"] or (owner_of(source, spec[side]) or [None])[0] == m["id"]:
            out.append(v)
    return sorted(set(out))


def contract_table(spec: dict) -> str:
    rows = ["| 契約 | 後端模組 | 前端模組 | 來源 | 狀態 |", "|---|---|---|---|---|"]
    for c in spec["contracts"]:
        rows.append(f"| {c['name']} | {c['backend']} | {'、'.join(c['frontend'])} | {c['source']} | {c['state']} |")
    return "**契約（兩端唯一的接縫）**\n\n" + "\n".join(rows)


def module_doc(m: dict, side: str, spec: dict, current: dict[str, list[str]]) -> str:
    owner = spec["owners"][side]
    uses = "全部（組裝層）" if "*" in m["uses"] else ("、".join(m["uses"]) or "不依賴其他模組")
    contracts = [c for c in spec["contracts"] if c["backend"] == m["id"] or m["id"] in c["frontend"]]
    lines = [BEGIN, f"## Scope（由 docs/modules/modules.json 產生；邊界 {STATUS[m['status']]}）", "",
             f"- 端：{'後端' if side == 'backend' else '前端'}；default owner：{owner}" + ("；視覺：" + spec["owners"]["visual"] if side == "frontend" else ""),
             f"- 可依賴的模組：{uses}"]
    if m.get("figma"):
        lines.append(f"- Figma：{m['figma']}")
    lines += ["", "檔案範圍：", *[f"- `{p}`" for p in m["paths"]], ""]
    lines += ["契約：", *([f"- {c['name']}（{c['state']}）" for c in contracts] or ["- —"]), ""]
    lines += ["## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）", ""]
    lines += [f"- `{v}`" for v in module_violations(m, side, current, spec)] or ["- 無"]
    lines += ["", "## 待清項（源頭修正，做完從這裡刪掉）", "", *([f"- {t}" for t in m["todo"]] or ["- 無"]), END]
    return "\n".join(lines)


def replace_block(text: str, block: str) -> str:
    if BEGIN in text:
        return re.sub(re.escape(BEGIN) + r".*?" + re.escape(END), lambda _: block, text, flags=re.S)
    return text.rstrip() + "\n\n" + block + "\n"


def write(spec: dict, current: dict[str, list[str]]) -> None:
    readme = DOCS / "README.md"
    block = "\n\n".join([BEGIN, "✅＝可以直接交給一個人；⚠️＝能交，先清待清違規；❌＝先做源頭修正再交。",
                         table(spec, "backend", current), table(spec, "frontend", current), contract_table(spec), END])
    readme.write_text(replace_block(readme.read_text(encoding="utf-8"), block), encoding="utf-8")
    for side in SIDES:
        (DOCS / side).mkdir(exist_ok=True)
        for m in spec[side]:
            doc = DOCS / side / f"{m['id']}.md"
            text = doc.read_text(encoding="utf-8") if doc.exists() else f"# {m['name']}（{'後端' if side == 'backend' else '前端'}）\n\n{m.get('about', '')}\n"
            doc.write_text(replace_block(text, module_doc(m, side, spec, current)), encoding="utf-8")


def kind(violation: str) -> str:
    """違規的種類與模組對，例：`classroom_core→group_dialogue`、`private-import`。"""
    return violation.partition("  ")[0]


def base_violations(ref: str) -> dict[str, list[str]] | None:
    """base 分支上的 violations.json；base 還沒有這個檔時回 None（不比對）。"""
    shown = subprocess.run(["git", "show", f"{ref}:docs/modules/violations.json"], cwd=ROOT, capture_output=True, text=True)
    if shown.returncode != 0:
        return None
    data = json.loads(shown.stdout)
    return data if isinstance(data, dict) else {"backend": data}


def main() -> int:
    spec = json.loads(MAP.read_text(encoding="utf-8"))
    problems, current = violations(spec)
    if "--baseline-ref" in sys.argv:
        ref = sys.argv[sys.argv.index("--baseline-ref") + 1]
        base = base_violations(ref)
        for side in SIDES if base is not None else ():
            # 以「種類／模組對」計數比對：搬檔會改路徑，但同一對模組的違規條數只能持平或變少
            mine, theirs = Counter(kind(v) for v in current[side]), Counter(kind(v) for v in base.get(side, []))
            problems += [f"{side} {k} 的違規 {n} 條，多於 base（{ref}）的 {theirs[k]} 條" for k, n in sorted(mine.items()) if n > theirs[k]]
    if "--update-baseline" in sys.argv:
        BASELINE.write_text(json.dumps(current, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if "--write" in sys.argv:
        write(spec, current)
    baseline = json.loads(BASELINE.read_text(encoding="utf-8")) if BASELINE.exists() else {"backend": [], "frontend": []}
    for side in SIDES:
        new = sorted(set(current[side]) - set(baseline.get(side, [])))
        fixed = sorted(set(baseline.get(side, [])) - set(current[side]))
        problems += [f"新的違規（{side}）：{v}" for v in new]
        problems += [f"已修好但還留在 violations.json（{side}，請刪掉這行）：{v}" for v in fixed]
    if problems:
        print(f"✗ 模組地圖有 {len(problems)} 處問題：")
        print("\n".join("    " + p for p in problems))
        return 1
    counts = "、".join(f"{'後端' if s == 'backend' else '前端'} {len(spec[s])} 模組／{len(tracked(s))} 檔／待清違規 {len(current[s])}" for s in SIDES)
    print(f"✓ 每個原始碼檔各屬一個模組；{counts}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
