import React, { useEffect, useState, useMemo } from 'react';
import { api } from './client';
import { forceLayout } from './graphLayout.mjs';
const palette = ['#c7acff', '#80d8d2', '#f3cc95', '#ecaaca', '#93b8ef', '#bad797'];
function polar(cx, cy, r, a) { return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
function arc(r1, r2, a, b) { const s = polar(200, 200, r2, a), e = polar(200, 200, r2, b), i = polar(200, 200, r1, b), j = polar(200, 200, r1, a); return `M${s} A${r2},${r2} 0 ${b - a > Math.PI ? 1 : 0} 1 ${e} L${i} A${r1},${r1} 0 ${b - a > Math.PI ? 1 : 0} 0 ${j} Z`; }
function Sunburst({ groups, select }) {
    const total = Math.max(1, groups.reduce((a, g) => a + Math.max(1, g.persons.length), 0));
    let cursor = -Math.PI / 2;
    return <svg viewBox="0 0 400 400" role="img" aria-label="全班、組別、個人、確認立場日輪圖"><text x="200" y="198" textAnchor="middle" fill="currentColor">全班觀點</text><text x="200" y="219" textAnchor="middle" fill="currentColor" fontSize="12">原話 · 確認</text>{groups.map((g, gi) => { const start = cursor, width = Math.PI * 2 * Math.max(1, g.persons.length) / total; cursor += width; return <g key={g.id}><path d={arc(68, 109, start, start + width - .01)} fill={palette[gi % palette.length]} opacity=".8" onClick={() => select(g.id)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && select(g.id)}><title>{g.label}</title></path>{g.persons.map((p, pi) => { const a = start + width * pi / g.persons.length, b = start + width * (pi + 1) / g.persons.length - .01; return <g key={p.id}><path d={arc(114, 153, a, b)} fill={palette[gi % palette.length]} opacity=".55" onClick={() => select(g.id, p.id)}><title>{p.nickname}</title></path><path d={arc(158, 184, a, b)} fill={p.confirmed ? palette[gi % palette.length] : '#4a4556'} onClick={() => select(g.id, p.id)}><title>{p.nickname}：{p.confirmed ? '已確認' : '思考中'}。{p.timeline.filter(n => n.kind === 'confirmed_viewpoint').at(-1)?.text || '以後續學生確認補入。'}</title></path></g>; })}</g>; })}</svg>;
}
function Sankey({ groups }) {
    const stages = Array.from(new Set(groups.flatMap(g => g.nodes.map(n => n.stage))));
    const links = new Map();
    for (const g of groups)
        for (const p of g.persons) {
            let last;
            for (const n of p.timeline) {
                if (last && last.stage !== n.stage) {
                    const key = last.stage + '|' + n.stage;
                    const edge = links.get(key) || { from: last.stage, to: n.stage, value: 0, quotes: [] };
                    edge.value++;
                    edge.quotes.push(`${p.nickname}：${last.text} → ${n.text}`);
                    links.set(key, edge);
                }
                last = n;
            }
        }
    const x = (s) => 35 + stages.indexOf(s) * Math.max(65, 590 / Math.max(1, stages.length - 1));
    return <svg viewBox={`0 0 ${Math.max(660, stages.length * 90)} 260`} role="img" aria-label="原話所屬舞台階段的流向"><text x="20" y="22" fill="currentColor" fontSize="12">線寬＝觀測到的個人階段轉移次數</text>{[...links.values()].map((l, i) => <path key={i} d={`M${x(l.from)},100 C${x(l.from) + 60},${180 + i % 3 * 12} ${x(l.to) - 60},${180 + i % 3 * 12} ${x(l.to)},100`} stroke={palette[i % palette.length]} strokeWidth={Math.min(22, 3 + l.value * 2)} fill="none" opacity=".65"><title>{l.from} → {l.to}：{l.value}\n{l.quotes.join('\n')}</title></path>)}{stages.map((s, i) => <g key={s}><rect x={x(s) - 6} y="70" width="12" height="65" rx="5" fill={palette[i % palette.length]}/><text x={x(s)} y="162" textAnchor="middle" fontSize="10" fill="currentColor" transform={`rotate(25 ${x(s)} 162)`}>{s}</text></g>)}{!stages.length && <text x="25" y="110" fill="currentColor">學生送出原話後，這裡呈現實際流向。</text>}</svg>;
}
function Graph({ group, pick }) {
    const nodes = group.nodes.slice(-150);
    const positions = useMemo(() => forceLayout(nodes, group.edges), [group.nodes, group.edges]);
    return <svg viewBox="0 0 600 380" role="img" aria-label="本組學生明示的論點關係圖">{group.edges.map((e, i) => { const a = positions.get(e.source), b = positions.get(e.target); return a && b ? <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={e.type === 'challenges' ? '#ecaaca' : '#aeb7d1'} opacity=".45"><title>{e.type} · {e.source} → {e.target}</title></line> : null; })}{nodes.map((n, i) => { const p = positions.get(n.id); return <g key={n.id} tabIndex={0} role="button" aria-label={n.nickname + '：' + n.text} onClick={() => pick(n)} onKeyDown={e => e.key === 'Enter' && pick(n)}><circle cx={p[0]} cy={p[1]} r={n.kind === 'confirmed_viewpoint' ? 10 : 6} fill={palette[i % palette.length]}/><title>{n.nickname} · {n.kind}\n{n.text}</title></g>; })}</svg>;
}
function ArgumentTree({ group, pick }) {
    const nodes = new Map(group.nodes.map(n => [n.id, n]));
    const rows = group.tree_projection || [];
    const render = (parent, depth = 0) => depth > 80 ? <p>後續節點可沿關係圖逐點回讀。</p> : rows.filter(r => r.parent === parent).map(row => {
        const node = nodes.get(row.id);
        if (!node)
            return null;
        return <details key={row.id} open={depth < 2} className="g70-tree-node"><summary><button className="quiet" onClick={event => { event.preventDefault(); pick(node); }}>{node.nickname} · {node.text.slice(0, 100)}</button></summary>
  {row.cross_references.map((edge, index) => <p key={index}><small>交叉引用 · {edge.type}</small><button className="quiet" onClick={() => { const source = nodes.get(edge.source); if (source)
            pick(source); }}>{nodes.get(edge.source)?.text.slice(0, 70) || edge.source}</button></p>)}
  <div className="g70-tree-children">{render(row.id, depth + 1)}</div></details>;
    });
    return <div className="g70-tree" aria-label="論點 DAG 的樹狀投影"><h4>{group.label} · 原話與論點脈絡</h4>{rows.length ? render(null) : <p>學生送出原話後，論點樹沿實際證據展開。</p>}</div>;
}
export function GroupAnalytics({ id }) {
    const [data, setData] = useState(null), [error, setError] = useState(''), [groupId, setGroupId] = useState(''), [personId, setPersonId] = useState(''), [quote, setQuote] = useState(null), [graphMode, setGraphMode] = useState('tree');
    useEffect(() => { let alive = true; const load = () => api(`/groups/classrooms/${id}/analysis`).then(x => { if (alive)
        setData(x); }).catch(e => { if (alive)
        setError(String(e)); }); void load(); const timer = setInterval(() => void load(), 5000); return () => { alive = false; clearInterval(timer); }; }, [id]);
    if (!data)
        return <p role="status">{error || '正在讀取原話與分析投影…'}</p>;
    const group = data.groups.find(g => g.id === groupId) || data.groups[0];
    const person = group?.persons.find(p => p.id === personId) || group?.persons[0];
    function select(g, p) { setGroupId(g); setPersonId(p || ''); }
    function download() { const a = document.createElement('a'); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.href = url; a.download = `socrates-${id}-pseudonymous-analysis.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    return <section className="g70-analytics"><div className="r2-row"><h2>觀點觀測室</h2><button onClick={download}>匯出假名化證據</button></div><p>Class → Group → Person。圖表保留學生原話與明示關係；每個點可回讀證據。原話內容由學生自行提供。</p>
 <div className="g70-chart-grid"><article className="r2-card"><h3>全班觀點日輪</h3><Sunburst groups={data.groups} select={select}/></article><article className="r2-card"><h3>組別階段流向</h3><Sankey groups={data.groups}/></article></div>
 <article className="r2-card"><h3>ACK / Completion Heatmap</h3><div className="g70-heatmap">{data.groups.map((g, gi) => <div key={g.id}><button className="quiet" onClick={() => select(g.id)}>{g.label}</button>{g.persons.map(p => <button key={p.id} title={p.nickname + ' · ' + (p.confirmed ? '已確認' : '思考中')} aria-label={p.nickname + ' · ' + (p.confirmed ? '已確認' : '思考中')} onClick={() => select(g.id, p.id)} style={{ background: p.confirmed ? palette[gi % palette.length] : '#484153', color: p.confirmed ? '#16131f' : '#fff' }}>{p.nickname.slice(0, 6)}{g.settlement.state === 'SETTLED' ? ' ✓' : ''}</button>)}</div>)}</div></article>
 {group && <><div className="r2-row"><label>組別<select value={group.id} onChange={e => select(e.target.value)}>{data.groups.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select></label><label>個人<select value={person?.id || ''} onChange={e => setPersonId(e.target.value)}>{group.persons.map(p => <option key={p.id} value={p.id}>{p.nickname}</option>)}</select></label></div>
 <div className="g70-chart-grid"><article className="r2-card"><h3>Argument Tree / Constellation</h3><div className="r2-row"><button className="quiet" aria-pressed={graphMode === 'tree'} onClick={() => setGraphMode('tree')}>論點樹</button><button className="quiet" aria-pressed={graphMode === 'graph'} onClick={() => setGraphMode('graph')}>力導向關係圖</button></div>{graphMode === 'tree' ? <ArgumentTree group={group} pick={setQuote}/> : <Graph group={group} pick={setQuote}/>}<p>supports · challenges · qualifies · revises</p>{quote && <blockquote><small>{quote.nickname} · {quote.stage}</small><p>{quote.text}</p><code>{quote.id}</code></blockquote>}</article><article className="r2-card"><h3>Personal Viewpoint Timeline</h3><div className="g70-timeline">{person?.timeline.map(n => <button key={n.id} className="g70-timeline-item" onClick={() => setQuote(n)}><small>{new Date(n.at * 1000).toLocaleTimeString()} · {n.stage} · {n.kind}</small><p>{n.text}</p></button>)}</div></article></div></>}
 </section>;
}
