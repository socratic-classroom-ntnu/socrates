#!/usr/bin/env python3
"""模組地圖檢查：backend/app 與 frontend/src 的每個原始碼檔都屬於且只屬於一個模組。

模組地圖在 docs/modules/modules.json；最長路徑前綴決定歸屬（目錄以 / 結尾）。
`--write` 依地圖重寫 docs/modules/README.md 的模組表與各模組文件的 scope 段落。
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAP = ROOT / "docs/modules/modules.json"
SKIP = re.compile(r"(\.test\.[jt]sx?$|__init__\.py$|\.d\.mts$|\.css$)")
STATUS = {"ok": "✅", "warn": "⚠️", "block": "❌"}
BEGIN, END = "<!-- module-map:begin -->", "<!-- module-map:end -->"


def tracked() -> list[str]:
    out = subprocess.check_output(["git", "ls-files", "backend/app", "frontend/src"], cwd=ROOT, text=True)
    return [f for f in out.split() if not SKIP.search(f)]


def owner_of(path: str, spec: dict) -> list[str]:
    best, owners = -1, []
    for module in spec["modules"]:
        for prefix in module["backend"] + module["frontend"]:
            hit = path == prefix or (prefix.endswith("/") and path.startswith(prefix))
            if hit and len(prefix) > best:
                best, owners = len(prefix), [module["id"]]
            elif hit and len(prefix) == best:
                owners.append(module["id"])
    return owners


def problems(spec: dict) -> list[str]:
    found = []
    for module in spec["modules"]:
        for prefix in module["backend"] + module["frontend"]:
            if not (ROOT / prefix).exists():
                found.append(f"{module['id']}: {prefix} 不存在")
    for path in tracked():
        owners = owner_of(path, spec)
        if not owners:
            found.append(f"{path}：沒有歸屬模組")
        elif len(owners) > 1:
            found.append(f"{path}：同時屬於 {', '.join(owners)}")
    return found


def scope(paths: list[str]) -> str:
    return "<br>".join(f"`{p}`" for p in paths) or "—"


def table(spec: dict) -> str:
    o = spec["owners"]
    rows = [
        "| 模組 | 邊界 | 後端（default owner：" + o["backend"] + "） | 前端（default owner：" + o["frontend"] + "） | 先清的項目 |",
        "|---|---|---|---|---|",
    ]
    for m in spec["modules"]:
        first = m["todo"][0] if m["todo"] else "—"
        rows.append(
            f"| [{m['name']}](./{m['id']}.md) | {STATUS[m['status']]} | {scope(m['backend'])} | {scope(m['frontend'])} | {first} |"
        )
    legend = "✅＝可以直接交給一個人；⚠️＝能交，先看「待清項」；❌＝先做源頭修正再交（否則兩個人會改到同一塊）。"
    return "\n".join([BEGIN, legend, "", *rows, END])


def module_section(m: dict, o: dict) -> str:
    lines = [BEGIN, f"## Scope（由 docs/modules/modules.json 產生；邊界 {STATUS[m['status']]}）", ""]
    def items(values: list[str], code: bool = True) -> list[str]:
        return [f"- `{v}`" if code else f"- {v}" for v in values] or ["- —"]

    lines += [f"後端（default owner：{o['backend']}）：", *items(m["backend"]), ""]
    lines += [f"前端（default owner：{o['frontend']}；視覺 {o['visual']}）：", *items(m["frontend"]), ""]
    lines += ["## 待清項（源頭修正，做完從這裡刪掉）", "", *items(m["todo"], code=False), END]
    return "\n".join(lines)


def replace_block(text: str, block: str, anchor: str) -> str:
    if BEGIN in text:
        return re.sub(re.escape(BEGIN) + r".*?" + re.escape(END), lambda _: block, text, flags=re.S)
    return text.replace(anchor, block + "\n\n" + anchor, 1) if anchor in text else text + "\n\n" + block + "\n"


def write(spec: dict) -> None:
    readme = ROOT / "docs/modules/README.md"
    text = readme.read_text(encoding="utf-8")
    # 舊的兩張手寫表（Backend模組／Frontend模組）由產生的表取代。
    text = re.sub(r"## Backend模組\n.*?(?=## 唯一接縫)", "## 模組地圖\n\n" + table(spec) + "\n\n", text, flags=re.S)
    if BEGIN not in text:
        text = text.replace("## 唯一接縫", "## 模組地圖\n\n" + table(spec) + "\n\n## 唯一接縫", 1)
    else:
        text = replace_block(text, table(spec), "## 唯一接縫")
    readme.write_text(text, encoding="utf-8")
    for m in spec["modules"]:
        doc = ROOT / f"docs/modules/{m['id']}.md"
        body = doc.read_text(encoding="utf-8")
        body = re.sub(r"## Current backend custody\n.*?(?=## Public contract)", "", body, flags=re.S)
        doc.write_text(replace_block(body, module_section(m, spec["owners"]), "## Public contract"), encoding="utf-8")


def main() -> int:
    spec = json.loads(MAP.read_text(encoding="utf-8"))
    if "--write" in sys.argv:
        write(spec)
    found = problems(spec)
    if found:
        print(f"✗ 模組地圖有 {len(found)} 處問題：")
        print("\n".join("    " + f for f in found))
        return 1
    print(f"✓ {len(tracked())} 個原始碼檔各屬於一個模組（{len(spec['modules'])} 個模組）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
