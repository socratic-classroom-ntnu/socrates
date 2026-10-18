#!/usr/bin/env python3
"""後端模組地圖檢查。

地圖在 docs/modules/modules.json：每個模組一個目錄 backend/app/modules/<id>/（搬移期間 paths 列出尚未搬入的原路徑）。檢查三件事：
1. 覆蓋：backend/app 的每個原始碼檔屬於且只屬於一個模組（最長路徑前綴）。
2. 依賴：跨模組 import 只能指向該模組 uses 列出的模組（uses 含 "*" 的是組裝層）。
3. route 檔不 import 其他 route 檔（組裝層除外）；ORM 只定義在 repositories/。

尚未清掉的違規逐條列在 docs/modules/violations.json：清單只能變短——新違規會失敗，
已修好的違規還留在清單上也會失敗（請把那一行刪掉）。PR 的 CI 另以 `--baseline-ref origin/<base>` 比對 base 分支的清單（依種類／模組對計數，搬檔改路徑不算新違規），
`--update-baseline` 收進來的新違規也會被擋。import 以 ast 解析（含相對 import、有程式碼的 __init__.py；docstring 不算）。`--write` 依地圖重寫 README 的模組表與各模組文件的 Scope 段。
"""

from __future__ import annotations

import ast
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs/modules"
MAP = DOCS / "modules.json"
BASELINE = DOCS / "violations.json"
STATUS = {"ok": "✅", "warn": "⚠️", "block": "❌"}
BEGIN, END = "<!-- module-map:begin -->", "<!-- module-map:end -->"


def has_code(path: str) -> bool:
    """__init__.py 只有 docstring 或空白時不算原始碼；有任何敘述就納入檢查。"""
    body = ast.parse((ROOT / path).read_text(encoding="utf-8")).body
    if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
        body = body[1:]
    return bool(body)


def tracked() -> list[str]:
    out = subprocess.check_output(["git", "ls-files", "backend/app"], cwd=ROOT, text=True)
    files = [f for f in out.split() if f.endswith(".py")]
    return [f for f in files if not f.endswith("__init__.py") or has_code(f)]


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
    """以 ast 讀出檔案 import 的模組（含 from 的名稱當子模組候選）；相對 import 依檔案位置還原。"""
    parts = path[len("backend/") : -len(".py")].split("/")
    package = parts[:-1]
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


def targets(path: str, tree: ast.Module) -> list[str]:
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



def check(spec: dict) -> tuple[list[str], list[str]]:
    modules = spec["backend"]
    by_id = {m["id"]: m for m in modules}
    problems = [f"{m['id']}: {p} 不存在" for m in modules for p in m["paths"] if not (ROOT / p).exists()]
    found: list[str] = []
    for path in tracked():
        owners = owner_of(path, modules)
        if len(owners) != 1:
            problems.append(f"{path}：{'沒有歸屬模組' if not owners else '同時屬於 ' + ', '.join(owners)}")
            continue
        me = by_id[owners[0]]
        tree = ast.parse((ROOT / path).read_text(encoding="utf-8"))
        deps = targets(path, tree)
        for target in deps:
            other = owner_of(target, modules)
            if other and other[0] != me["id"] and "*" not in me["uses"] and other[0] not in me["uses"]:
                found.append(f"{me['id']}→{other[0]}  {path} → {target}")
        if "/api/routes/" in path and "*" not in me["uses"]:
            found += [f"route-imports-route  {path} → {t}" for t in deps if "/api/routes/" in t and t != path]
        if "/repositories/" not in path and defines_table(tree):
            found.append(f"orm-outside-repositories  {path}")
    return problems, sorted(set(found))


def module_violations(m: dict, current: list[str], modules: list[dict]) -> list[str]:
    out = []
    for v in current:
        head, _, rest = v.partition("  ")
        source = rest.split(" → ")[0]
        if head.split("→")[0] == m["id"] or (owner_of(source, modules) or [None])[0] == m["id"]:
            out.append(v)
    return sorted(set(out))


def uses_text(m: dict) -> str:
    return "全部（組裝層）" if "*" in m["uses"] else ("、".join(m["uses"]) or "不依賴其他模組")


def readme_block(spec: dict, current: list[str]) -> str:
    o = spec["owners"]
    rows = ["| 模組 | 邊界 | 檔案範圍 | 可依賴 | 待清違規 |", "|---|---|---|---|---|"]
    for m in spec["backend"]:
        scope = "<br>".join(f"`{p}`" for p in m["paths"])
        rows.append(f"| [{m['name']}](./backend/{m['id']}.md) | {STATUS[m['status']]} | {scope} | {uses_text(m)} | {len(module_violations(m, current, spec['backend']))} |")
    contracts = ["| 契約 | 後端模組 | 前端使用處 | 來源 | 狀態 |", "|---|---|---|---|---|"]
    contracts += [f"| {c['name']} | {c['backend']} | {c['consumer']} | {c['source']} | {c['state']} |" for c in spec["contracts"]]
    return "\n\n".join([BEGIN, "✅＝可以直接交給一個人；⚠️＝能交，先清待清違規；❌＝先做源頭修正再交。",
                        f"**後端模組**（架構與審查：{o['architecture']}；執行：{o['backend_worker']}；前端：{o['frontend']}）\n\n" + "\n".join(rows),
                        "**契約（前後端唯一的接縫）**\n\n" + "\n".join(contracts), END])


def module_block(m: dict, spec: dict, current: list[str]) -> str:
    o = spec["owners"]
    contracts = [c for c in spec["contracts"] if c["backend"] == m["id"]]
    lines = [BEGIN, f"## Scope（由 docs/modules/modules.json 產生；邊界 {STATUS[m['status']]}）", "",
             f"- 架構與審查：{o['architecture']}；執行：{o['backend_worker']}", f"- 可依賴的模組：{uses_text(m)}", "",
             "檔案範圍：", *[f"- `{p}`" for p in m["paths"]], "",
             "契約：", *([f"- {c['name']}（{c['state']}）" for c in contracts] or ["- —"]), "",
             "## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）", "",
             *([f"- `{v}`" for v in module_violations(m, current, spec["backend"])] or ["- 無"]), "",
             "## 待清項（源頭修正，做完從這裡刪掉）", "", *([f"- {t}" for t in m["todo"]] or ["- 無"]), END]
    return "\n".join(lines)


def replace_block(text: str, block: str) -> str:
    if BEGIN in text:
        return re.sub(re.escape(BEGIN) + r".*?" + re.escape(END), lambda _: block, text, flags=re.S)
    return text.rstrip() + "\n\n" + block + "\n"


def write(spec: dict, current: list[str]) -> None:
    readme = DOCS / "README.md"
    readme.write_text(replace_block(readme.read_text(encoding="utf-8"), readme_block(spec, current)), encoding="utf-8")
    (DOCS / "backend").mkdir(exist_ok=True)
    for m in spec["backend"]:
        doc = DOCS / "backend" / f"{m['id']}.md"
        text = doc.read_text(encoding="utf-8") if doc.exists() else f"# {m['name']}（後端）\n\n{m.get('about', '')}\n"
        doc.write_text(replace_block(text, module_block(m, spec, current)), encoding="utf-8")


def kind(violation: str) -> str:
    """違規的種類與模組對，例：`classroom_core→group_dialogue`、`orm-outside-repositories`。"""
    return violation.partition("  ")[0]


def base_violations(ref: str) -> list[str] | None:
    """PR 的 base 分支上的 violations.json；base 還沒有這個檔時回 None（不比對）。"""
    shown = subprocess.run(["git", "show", f"{ref}:docs/modules/violations.json"], cwd=ROOT, capture_output=True, text=True)
    return json.loads(shown.stdout).get("backend", []) if shown.returncode == 0 else None


def main() -> int:
    spec = json.loads(MAP.read_text(encoding="utf-8"))
    problems, current = check(spec)
    if "--baseline-ref" in sys.argv:
        ref = sys.argv[sys.argv.index("--baseline-ref") + 1]
        base = base_violations(ref)
        if base is not None:
            # 以「種類／模組對」計數比對：搬檔會改路徑，但同一對模組的違規條數只能持平或變少
            mine, theirs = Counter(kind(v) for v in current), Counter(kind(v) for v in base)
            problems += [f"{k} 的違規 {n} 條，多於 base 分支（{ref}）的 {theirs[k]} 條" for k, n in sorted(mine.items()) if n > theirs[k]]
    if "--update-baseline" in sys.argv:
        BASELINE.write_text(json.dumps({"backend": current}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if "--write" in sys.argv:
        write(spec, current)
    baseline = json.loads(BASELINE.read_text(encoding="utf-8")).get("backend", []) if BASELINE.exists() else []
    problems += [f"新的違規：{v}" for v in sorted(set(current) - set(baseline))]
    problems += [f"已修好但還留在 violations.json（請刪掉這行）：{v}" for v in sorted(set(baseline) - set(current))]
    if problems:
        print(f"✗ 模組地圖有 {len(problems)} 處問題：")
        print("\n".join("    " + p for p in problems))
        return 1
    print(f"✓ 後端 {len(spec['backend'])} 個模組、{len(tracked())} 個原始碼檔各屬一個模組；待清違規 {len(current)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
