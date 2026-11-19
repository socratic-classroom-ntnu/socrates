"""The report's pages, from runs/ and report/numbers.json (run analyze.py first). No provider.

report/blind.html        A: one run with students under letters, for picking alike and unalike
report/tendencies.html   B: the same tendencies as radar, bars and cards
report/report.html       report/report.template.html filled in; {{runs}} is every run, one small
                         radar per student with the axes and their poles

python build_pages.py
"""

from __future__ import annotations

import html
import json
import math
import random
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
RUNS = HERE / "runs"
REPORT = HERE / "report"
BLIND_RUN = "before/n16-1"
BLIND_SEED = 20261119
# Room left and right of each radar for the axis names.
PAD = 34
ROUTES = {"llm": "模型定軸＋模型評分", "embedding": "向量＋主成分"}

STYLE = """
:root{color-scheme:light;--surface:#fcfcfb;--panel:#f4f3f0;--text:#0b0b0b;--text-2:#52514e;
--muted:#8a8984;--grid:#dcdad4;--series:#2a78d6;--series-fill:rgba(42,120,214,.16);--rule:#e6e4df}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--surface:#1a1a19;
--panel:#232321;--text:#f0efec;--text-2:#c3c2b7;--muted:#8f8e86;--grid:#3a3936;--series:#3987e5;
--series-fill:rgba(57,135,229,.22);--rule:#33322f}}
:root[data-theme="dark"]{color-scheme:dark;--surface:#1a1a19;--panel:#232321;--text:#f0efec;
--text-2:#c3c2b7;--muted:#8f8e86;--grid:#3a3936;--series:#3987e5;--series-fill:rgba(57,135,229,.22);
--rule:#33322f}
*{box-sizing:border-box}
body{margin:0;background:var(--surface);color:var(--text);font:15px/1.6 system-ui,-apple-system,
"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif}
main{max-width:1200px;margin:0 auto;padding-block:24px 64px;
padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
main>*{min-width:0}
h1{font-size:26px;line-height:1.3;margin:0 0 8px}h2{font-size:20px;margin:40px 0 8px}
h3{font-size:16px;margin:24px 0 8px}p,li{color:var(--text-2)}strong{color:var(--text)}
.lede{font-size:16px;max-width:760px}
nav.toc{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}
nav.toc a{padding:4px 10px;border:1px solid var(--rule);border-radius:999px;color:var(--text-2);
text-decoration:none;font-size:13px}
section.run{border-top:1px solid var(--rule);padding-top:8px}
.meta{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px;color:var(--text-2);margin:4px 0 12px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 12px}
.chip{background:var(--panel);border-radius:8px;padding:6px 10px;font-size:13px;color:var(--text-2)}
.chip b{color:var(--text);font-size:15px;margin-right:4px}
.table-wrap{overflow-x:auto;max-width:100%}
table{border-collapse:collapse;font-size:13px;margin:8px 0}
th,td{border-bottom:1px solid var(--rule);padding:6px 10px;text-align:left;vertical-align:top}
th{color:var(--text-2);font-weight:600}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:12px}
.card{background:var(--panel);border-radius:10px;padding:10px 10px 6px}
.card h4{margin:0;font-size:14px;display:flex;justify-content:space-between;gap:8px}
.card h4 span{font-weight:400;font-size:12px;color:var(--muted)}
.tag{font-size:11px;border:1px solid var(--muted);color:var(--text-2);border-radius:4px;padding:0 4px}
svg{display:block;width:100%;height:auto}
svg text{fill:var(--text-2);font-size:10.5px}
.ring{fill:none;stroke:var(--grid);stroke-width:1}.spoke{stroke:var(--grid);stroke-width:1}
.shape{fill:var(--series-fill);stroke:var(--series);stroke-width:2;stroke-linejoin:round}
.dot{fill:var(--series);stroke:var(--surface);stroke-width:2}
.hit{fill:transparent;cursor:pointer}.hit:focus{outline:none;stroke:var(--text);stroke-width:1.5}
.bar-row{display:grid;grid-template-columns:minmax(0,1fr) 92px 18px;gap:6px;align-items:center;
font-size:13px;margin:4px 0}
.bar-row .label{color:var(--text);overflow-wrap:anywhere}
.bar{height:8px;background:var(--grid);border-radius:4px;position:relative}
.bar i{position:absolute;inset:0 auto 0 0;background:var(--series);border-radius:4px}
.bar-row .val{color:var(--text-2);font-variant-numeric:tabular-nums;text-align:right}
.tcard{border-top:1px solid var(--rule);padding:8px 0}.tcard:first-of-type{border-top:0}
.tcard b{color:var(--text)}.tcard .s{color:var(--muted);font-size:12px;margin-left:6px}
.tcard p{margin:2px 0;font-size:13px}.tcard q{display:block;font-size:13px;color:var(--text);
border-left:2px solid var(--grid);padding-left:8px;margin:4px 0}
details{margin:8px 0}summary{cursor:pointer;color:var(--text-2);font-size:13px}
#tip{position:fixed;z-index:10;max-width:280px;background:var(--text);color:var(--surface);
border-radius:8px;padding:8px 10px;font-size:12.5px;line-height:1.5;pointer-events:none;
display:none;white-space:pre-line}
.note{background:var(--panel);border-radius:10px;padding:12px 14px;margin:12px 0;color:var(--text-2)}
"""

SCRIPT = """
const tip=document.getElementById('tip');
function show(e){const t=e.target.closest('[data-tip]');if(!t)return;tip.textContent=t.dataset.tip;
tip.style.display='block';const r=t.getBoundingClientRect();
let x=r.left+r.width/2+12,y=r.top+r.height/2+12;
const w=tip.offsetWidth,h=tip.offsetHeight;if(x+w>innerWidth-8)x=r.left-w-12;
if(y+h>innerHeight-8)y=r.top-h-12;tip.style.left=Math.max(8,x)+'px';tip.style.top=Math.max(8,y)+'px'}
function hide(){tip.style.display='none'}
document.addEventListener('pointerover',show);document.addEventListener('pointerout',hide);
document.addEventListener('focusin',show);document.addEventListener('focusout',hide);
"""


def esc(text) -> str:
    return html.escape(str(text), quote=True)


def page(title: str, body: str) -> str:
    """Page content only: the publish step (and any browser) supplies the document skeleton."""
    return (
        f"<title>{esc(title)}</title>"
        '<meta name="claude:viewport-fit-sides" content="cover">'
        f"<style>{STYLE}</style><main>{body}</main>"
        f'<div id="tip" role="tooltip"></div><script>{SCRIPT}</script>\n'
    )


def radar_svg(labels: list[str], scores: list[float], tips: list[str], size: int = 220) -> str:
    """One student's radar: rings at 1–4, one spoke per axis, the shape, a hover target per vertex."""
    n = len(labels)
    cx, cy, radius = size / 2, size / 2 + 2, size / 2 - 46
    angle = [-math.pi / 2 + 2 * math.pi * k / n for k in range(n)]

    def at(k: int, value: float) -> tuple[float, float]:
        return cx + radius * value / 4 * math.cos(angle[k]), cy + radius * value / 4 * math.sin(
            angle[k]
        )

    parts = []
    for ring in (1, 2, 3, 4):
        points = " ".join(f"{x:.1f},{y:.1f}" for x, y in (at(k, ring) for k in range(n)))
        parts.append(f'<polygon class="ring" points="{points}"/>')
    for k in range(n):
        x, y = at(k, 4)
        parts.append(f'<line class="spoke" x1="{cx}" y1="{cy}" x2="{x:.1f}" y2="{y:.1f}"/>')
        lx, ly = at(k, 4.9)
        cos = math.cos(angle[k])
        anchor = "middle" if abs(cos) < 0.3 else ("start" if cos > 0 else "end")
        lines = _wrap(labels[k], 6)
        dy = -5.5 * (len(lines) - 1)
        tspans = "".join(
            f'<tspan x="{lx:.1f}" dy="{dy if i == 0 else 11}">{esc(line)}</tspan>'
            for i, line in enumerate(lines)
        )
        parts.append(
            f'<text x="{lx:.1f}" y="{ly + 3.5:.1f}" text-anchor="{anchor}">{tspans}</text>'
        )
    shape = " ".join(f"{x:.1f},{y:.1f}" for x, y in (at(k, s) for k, s in enumerate(scores)))
    parts.append(f'<polygon class="shape" points="{shape}"/>')
    for k, s in enumerate(scores):
        x, y = at(k, s)
        parts.append(f'<circle class="dot" cx="{x:.1f}" cy="{y:.1f}" r="4"/>')
        parts.append(
            f'<circle class="hit" cx="{x:.1f}" cy="{y:.1f}" r="11" tabindex="0" '
            f'data-tip="{esc(tips[k])}"/>'
        )
    alt = "、".join(f"{label} {s:g}" for label, s in zip(labels, scores))
    return (
        f'<svg viewBox="{-PAD} 0 {size + 2 * PAD} {size + 4}" role="img" aria-label="{esc(alt)}">'
        + "".join(parts)
        + "</svg>"
    )


def _wrap(text: str, width: int) -> list[str]:
    return [text[i : i + width] for i in range(0, len(text), width)] or [""]


def _read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def run_title(key: str, number: dict) -> str:
    group, name = key.split("/")
    count, run = re.match(r"n(\d+)-(\d+)", name).groups()
    kind = {"before": "", "growing": "（依序加入）", "after": "（軸修正後）"}[group]
    if group == "growing":
        return f"{count} 人{kind}"
    return f"{count} 人 第 {run} 次{kind}"


def run_section(key: str, run: dict, number: dict, anchor: str = "") -> str:
    view = run["view"]
    dims = view["dimensions"]
    labels = [d["name"] for d in dims]
    routes = "、".join(ROUTES.get(s, s) for s in number["sources"])
    meta = [
        f"路線：{routes}（source = {'、'.join(number['sources'])}）",
        f"模型：{'、'.join(number['models'])}",
        f"呼叫 {number['calls']} 次，失敗 {len(number['failed_calls'])} 次",
        f"US${number['cost']:.4f}",
        f"{number['seconds']} 秒",
    ]
    dup = "、".join(
        f"{a}／{b}（r = {r['r']}）" for r in number["duplicates"] for a, b in [r["axes"]]
    )
    chips = [
        ("重複的軸對", len(number["duplicates"]), dup or "沒有"),
        (
            "平的學生",
            f"{len(number['flat'])}/{number['count']}",
            "、".join(number["flat"]) or "沒有",
        ),
        ("沒附原話的格子", f"{number['cells_without_quote']}/{number['cells']}", ""),
        ("被剔除", len(number["left_out"]), "、".join(number["left_out"]) or "沒有"),
    ]
    axis_rows = "".join(
        f"<tr><td>{d['index'] + 1}</td><td><b>{esc(d['name'])}</b></td><td>{esc(d['low_pole'])}</td>"
        f"<td>{esc(d['high_pole'])}</td></tr>"
        for d in dims
    )
    cards = []
    for s in view["students"]:
        stats = number["students"][s["display_name"]]
        tips = [
            f"{labels[x['dimension_index']]}：{x['score']:g} 分\n"
            + ("\n".join(f"「{q['quote']}」" for q in x["sources"]) or "（沒有附原話）")
            for x in s["scores"]
        ]
        flat = ' <span class="tag">平</span>' if stats["flat"] else ""
        cards.append(
            f'<div class="card"><h4>{esc(s["display_name"])}{flat}'
            f'<span>差 {stats["spread"]:g}・標準差 {stats["stdev"]}</span></h4>'
            + radar_svg(labels, [x["score"] for x in s["scores"]], tips)
            + "</div>"
        )
    head = "".join(f'<th class="num">{esc(label)}</th>' for label in labels)
    rows = "".join(
        f"<tr><td>{esc(n)}</td>"
        + "".join(f'<td class="num">{v:g}</td>' for v in st["scores"])
        + f'<td class="num">{st["spread"]:g}</td><td class="num">{st["stdev"]}</td></tr>'
        for n, st in number["students"].items()
    )
    return (
        f'<section class="run" id="{esc(anchor or key)}"><h3>{esc(run_title(key, number))}</h3>'
        f'<div class="meta">{"".join(f"<span>{esc(m)}</span>" for m in meta)}</div>'
        '<div class="chips">'
        + "".join(
            f'<span class="chip" title="{esc(detail)}"><b>{esc(value)}</b>{esc(name)}'
            + (f"：{esc(detail)}" if detail and name != "沒附原話的格子" else "")
            + "</span>"
            for name, value, detail in chips
        )
        + "</div>"
        f'<div class="table-wrap"><table><tr><th>#</th><th>軸</th><th>0 分那端</th><th>4 分那端</th></tr>'
        f"{axis_rows}</table></div>"
        f'<div class="grid">{"".join(cards)}</div>'
        f'<details><summary>分數表</summary><div class="table-wrap"><table><tr><th>學生</th>{head}'
        f'<th class="num">最高−最低</th><th class="num">標準差</th></tr>{rows}</table></div></details>'
        "</section>"
    )


def run_sections(numbers: dict) -> dict[str, str]:
    return {
        key: run_section(key, _read(RUNS / f"{key}.json"), number)
        for key, number in numbers["runs"].items()
    }


def blind_page() -> tuple[str, dict]:
    run = _read(RUNS / f"{BLIND_RUN}.json")
    view = run["view"]
    labels = [d["name"] for d in view["dimensions"]]
    students = list(view["students"])
    random.Random(BLIND_SEED).shuffle(students)
    letters = "ABCDEFGHIJKLMNOP"
    key = {letters[i]: s["display_name"] for i, s in enumerate(students)}
    axis_rows = "".join(
        f"<tr><td><b>{esc(d['name'])}</b></td><td>{esc(d['low_pole'])}</td><td>{esc(d['high_pole'])}</td></tr>"
        for d in view["dimensions"]
    )
    cards = "".join(
        f'<div class="card"><h4>學生 {letters[i]}</h4>'
        + radar_svg(
            labels,
            [x["score"] for x in s["scores"]],
            [f"{labels[x['dimension_index']]}：{x['score']:g} 分" for x in s["scores"]],
        )
        + "</div>"
        for i, s in enumerate(students)
    )
    body = (
        "<h1>雷達小圖：哪兩位最像、哪兩位最不一樣？</h1>"
        '<p class="lede">這是一班 16 位學生在同一份雷達上的形狀，學生用代號表示。請只看圖，'
        "不要先查學生是誰，各自回答兩題：</p>"
        "<ol><li><strong>想法最像的兩位</strong>是哪兩位？（例如 C 和 K）</li>"
        "<li><strong>想法最不一樣的兩位</strong>是哪兩位？</li></ol>"
        "<p>可以順便寫一句你是看哪裡判斷的。滑到頂點上會顯示分數。</p>"
        f'<div class="table-wrap"><table><tr><th>軸</th><th>0 分那端</th><th>4 分那端</th></tr>{axis_rows}</table></div>'
        f'<div class="grid">{cards}</div>'
    )
    return page("雷達小圖盲測", body), key


def tendency_parts(entry: dict) -> tuple[str, str, str]:
    items = entry["tendencies"]
    labels = [t["name"] for t in items]
    tips = [
        f"{t['name']}：{t['strength']}\n{t['reading']}\n"
        + "\n".join(f"「{q['quote']}」" for q in t["quotes"])
        for t in items
    ]
    radar = radar_svg(labels, [t["strength"] for t in items], tips)
    ordered = sorted(items, key=lambda t: -t["strength"])
    bars = "".join(
        f'<div class="bar-row" data-tip="{esc(t["reading"])}" tabindex="0">'
        f'<span class="label">{esc(t["name"])}</span>'
        f'<span class="bar"><i style="width:{t["strength"] / 4 * 100:.0f}%"></i></span>'
        f'<span class="val">{t["strength"]}</span></div>'
        for t in ordered
    )
    cards = "".join(
        f'<div class="tcard"><b>{esc(t["name"])}</b><span class="s">強度 {t["strength"]}／4</span>'
        f"<p>{esc(t['reading'])}</p>"
        + "".join(f"<q>{esc(q['quote'])}</q>" for q in t["quotes"])
        + "</div>"
        for t in ordered
    )
    return radar, bars, cards


def tendencies_page(label: str = "1") -> tuple[str, dict[str, tuple[str, str, str]]]:
    run = _read(RUNS / "tendencies" / f"{label}.json")
    parts = {
        name: tendency_parts(entry)
        for name, entry in run["students"].items()
        if "error" not in entry
    }
    sections = []
    for title, index, note in (
        ("雷達圖", 0, "每個傾向一軸。挑出 3 個傾向的學生是三角形。"),
        ("由強到弱的長條", 1, "同一批傾向，依強度排序。滑到長條上看解讀。"),
        ("傾向卡片", 2, "名稱、強度、一句解讀、學生原話（都在原訊息裡逐字找得到）。"),
    ):
        cards = "".join(
            f'<div class="card"><h4>{esc(name)}</h4>{p[index]}</div>' for name, p in parts.items()
        )
        sections.append(
            f'<section class="run" id="v{index}"><h2>{title}</h2><p>{note}</p>'
            f'<div class="grid">{cards}</div></section>'
        )
    body = (
        "<h1>每位學生自己的傾向：三種呈現</h1>"
        f'<p class="lede">雛型 B 第 {esc(label)} 次的結果：模型（{esc(run["model"])}）讀一位學生的話與最終統整，'
        "挑出 3–5 個這位學生最明顯的傾向。同一批資料畫成三種樣子，請看完後說說<strong>哪一種最好讀、為什麼</strong>。</p>"
        '<nav class="toc"><a href="#v0">雷達圖</a><a href="#v1">長條</a><a href="#v2">卡片</a></nav>'
        + "".join(sections)
    )
    return page("傾向三種呈現", body), parts


def tendency_table(numbers: dict) -> str:
    judged = _read(REPORT / "tendency_judgments.json")["labels"]
    runs = numbers["tendencies"]["runs"]
    head = "".join(f"<th>第 {esc(r)} 次</th>" for r in runs)
    rows = []
    for name, by_run in numbers["tendencies"]["students"].items():
        cells = "".join(
            "<td>"
            + (
                f"<em>失敗：{esc(e['error'])}</em>"
                if "error" in e
                else "<br>".join(f"{esc(t)}（{s}）" for t, s in e["tendencies"])
            )
            + "</td>"
            for e in (by_run[r] for r in runs)
        )
        rows.append(f"<tr><td><b>{esc(name)}</b></td>{cells}<td>{esc(judged[name])}</td></tr>")
    return (
        f'<div class="table-wrap"><table><tr><th>學生</th>{head}<th>三次一不一樣</th></tr>'
        + "".join(rows)
        + "</table></div>"
    )


def fill(template: str, sections: dict[str, str], tendency: dict, numbers: dict) -> str:
    def one(match: re.Match) -> str:
        kind, _, arg = match[1].partition(":")
        if kind == "run":
            return sections[arg]
        if kind == "runs":
            toc = "".join(
                f'<a href="#{esc(k)}">{esc(run_title(k, numbers["runs"][k]))}</a>' for k in sections
            )
            return f'<nav class="toc">{toc}</nav>' + "".join(sections.values())
        if kind == "tendency-table":
            return tendency_table(numbers)
        if kind == "tendency":
            radar, bars, cards = tendency[arg]
            return (
                f'<div class="grid"><div class="card"><h4>雷達圖</h4>{radar}</div>'
                f'<div class="card"><h4>長條</h4>{bars}</div><div class="card"><h4>卡片</h4>{cards}</div></div>'
            )
        raise KeyError(match[0])

    return re.sub(r"\{\{([^}]+)\}\}", one, template)


def main() -> None:
    numbers = _read(REPORT / "numbers.json")
    sections = run_sections(numbers)
    blind, key = blind_page()
    (REPORT / "blind.html").write_text(blind, encoding="utf-8")
    (REPORT / "blind_key.json").write_text(
        json.dumps(
            {"run": BLIND_RUN, "seed": BLIND_SEED, "letters": key}, ensure_ascii=False, indent=1
        )
        + "\n",
        encoding="utf-8",
    )
    tendencies, parts = tendencies_page()
    (REPORT / "tendencies.html").write_text(tendencies, encoding="utf-8")
    template = REPORT / "report.template.html"
    if template.exists():
        body = fill(template.read_text(encoding="utf-8"), sections, parts, numbers)
        (REPORT / "report.html").write_text(page("雷達圖實測評估", body), encoding="utf-8")
    print("wrote", ", ".join(p.name for p in sorted(REPORT.glob("*.html"))))


if __name__ == "__main__":
    main()
