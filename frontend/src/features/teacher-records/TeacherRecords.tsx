import './teacher-records.css';

// 教師完整分析：把每題的紀錄（personal_records）畫成立場分布、立場變化、深入討論與個人追問；原始 JSON 收在最後。
const COLORS = ['#2f6f5e', '#c27c3a', '#5162a8', '#a9566b', '#7a8a3a', '#6b5a8e'];
const LETTERS = 'ABCDEF';
const STATUS = { confirmed: '已確認觀點', probing: '追問中', open: '進行中', skipped: '略過', closed: '已結束' };
const END_REASON = { ai_student: 'AI 學生', teacher: '老師結束', timeout: '時間到', all_settled: '全部完成', confirmed: '學生確認', student_confirmed: '學生確認', teacher_force_end: '老師強制結束' };

type Member = { id: string; alias: string; actor_type?: string };
type Option = { option_id: string; text: string; count: number; percent: number };

function optionIndex(options: Option[]) {
    const index = new Map<string, number>();
    options.forEach((o, i) => index.set(o.option_id, i));
    return index;
}

function OptionChip({ id, options }: { id?: string | null; options: Option[] }) {
    if (!id)
        return <span className="tr-chip tr-chip-empty">未作答</span>;
    const i = optionIndex(options).get(id);
    if (i === undefined)
        return <span className="tr-chip tr-chip-empty">{id === '__other__' ? '其他' : id}</span>;
    return <span className="tr-chip" style={{ background: COLORS[i % COLORS.length] }} title={options[i].text}>{LETTERS[i] || i + 1}</span>;
}

function Person({ member }: { member?: Member }) {
    const ai = member?.actor_type === 'llm_student';
    // AI 學生的名稱本身帶「 · AI」，改用徽章標示就不重複。
    const alias = ai ? (member?.alias || '').replace(/\s*·\s*AI$/, '') : member?.alias;
    return <span className="tr-person">{alias || '（已離開）'}{ai && <small className="tr-ai">AI</small>}</span>;
}

function Distribution({ options }: { options: Option[] }) {
    const total = options.reduce((n, o) => n + o.count, 0);
    return <div className="tr-block">
      <h4>立場分布 <small>{total} 人確認</small></h4>
      <div className="tr-stack" role="img" aria-label={options.map((o, i) => `${LETTERS[i]} ${o.count} 人`).join('、')}>
        {options.filter(o => o.count > 0).map(o => { const i = optionIndex(options).get(o.option_id) ?? 0; return <span key={o.option_id} style={{ width: o.percent + '%', background: COLORS[i % COLORS.length] }}>{o.percent >= 12 ? `${LETTERS[i]} ${Math.round(o.percent)}%` : ''}</span>; })}
        {total === 0 && <span className="tr-stack-empty">尚無確認的立場</span>}
      </div>
      <ul className="tr-legend">{options.map((o, i) => <li key={o.option_id}><span className="tr-chip" style={{ background: COLORS[i % COLORS.length] }}>{LETTERS[i]}</span><span className="tr-legend-text">{o.text}</span><b>{o.count} 人 · {o.percent.toFixed(0)}%</b></li>)}</ul>
    </div>;
}

function Shifts({ run, options, members }) {
    const ids = Object.keys(run.answers || {});
    if (!ids.length)
        return null;
    const rows = ids.map(id => ({ id, first: run.answers[id]?.option_id, last: run.personal?.[id]?.baseline?.option_id }));
    const changed = rows.filter(r => r.last && r.first && r.last !== r.first).length;
    return <div className="tr-block">
      <h4>立場變化 <small>初次作答 → 確認觀點 · 改變 {changed} 人</small></h4>
      <ul className="tr-shifts">{rows.map(r => <li key={r.id}><Person member={members.get(r.id)}/><OptionChip id={r.first} options={options}/><span className="tr-arrow" aria-hidden="true">→</span><OptionChip id={r.last} options={options}/><span className={'tr-tag ' + (!r.last ? 'pending' : r.last === r.first ? 'kept' : 'moved')}>{!r.last ? '未確認' : r.last === r.first ? '維持' : '改變'}</span></li>)}</ul>
    </div>;
}

function Focuses({ run, options, members, maxTurns }) {
    const focuses = run.focuses || [];
    if (!focuses.length)
        return null;
    return <div className="tr-block">
      <h4>深入討論 <small>{focuses.length} 段</small></h4>
      {focuses.map(f => { const obs = f.last_observations || {}; const turns = f.completed_turns ?? 0; return <article className="tr-focus" key={f.id}>
        <header><Person member={members.get(f.member_id)}/><OptionChip id={f.option_id} options={options}/>{obs.principle_label && <span className="tr-tag principle">{obs.principle_label}</span>}</header>
        <div className="tr-turns" aria-label={`完成 ${turns} 輪`}>{Array.from({ length: Math.max(maxTurns || turns, turns) }, (_, i) => <i key={i} className={i < turns ? 'done' : ''}/>)}<small>{turns}{maxTurns ? ` / ${maxTurns}` : ''} 輪</small></div>
        <div className="tr-flags"><span className={obs.has_reason ? 'on' : ''}>有理由</span><span className={obs.reason_tested ? 'on' : ''}>理由經過檢驗</span><span className={obs.position_shifted ? 'on' : ''}>立場移動</span></div>
        {f.micro_summary && <p className="tr-summary">{f.micro_summary}</p>}
      </article>; })}
    </div>;
}

function Personal({ run, options, members }) {
    const personal = run.personal || {};
    const entries = Object.keys(personal).map(id => [id, personal[id]]);
    if (!entries.length)
        return null;
    return <div className="tr-block">
      <h4>個人追問與確認觀點 <small>{entries.filter(([, e]) => e.baseline).length} / {entries.length} 人已確認</small></h4>
      <div className="tr-grid">{entries.map(([id, e]) => <article className="tr-baseline" key={id}>
        <header><Person member={members.get(id)}/><OptionChip id={e.baseline?.option_id} options={options}/><span className="tr-tag">{STATUS[e.status] || e.status}</span></header>
        {e.baseline?.position && <p><b>{e.baseline.position}</b></p>}
        {e.baseline?.reason_summary && <p className="tr-muted">{e.baseline.reason_summary}</p>}
        {!!e.baseline?.conditions?.length && <ul className="tr-conditions">{e.baseline.conditions.map((c, i) => <li key={i}>{typeof c === 'string' ? c : c.text || JSON.stringify(c)}</li>)}</ul>}
        <small className="tr-muted">追問 {e.completed_turns ?? 0} 輪{e.end_reason ? ` · ${END_REASON[e.end_reason] || e.end_reason}` : ''}</small>
      </article>)}</div>
    </div>;
}

function ModelUse({ run }) {
    const used = new Map<string, { n: number; ms: number; requested: Set<string> }>();
    for (const f of run.focuses || [])
        for (const m of f.messages || []) {
            const p = m.provenance;
            if (!p?.actual_model)
                continue;
            const row = used.get(p.actual_model) || { n: 0, ms: 0, requested: new Set<string>() };
            row.n += 1;
            row.ms += p.latency_ms || 0;
            if (p.requested_model)
                row.requested.add(p.requested_model);
            used.set(p.actual_model, row);
        }
    if (!used.size)
        return null;
    return <p className="tr-models">導師模型：{[...used].map(([model, r]) => `${model} ×${r.n}（平均 ${(r.ms / r.n / 1000).toFixed(1)} 秒${[...r.requested].some(x => x !== model) ? `，設定為 ${[...r.requested].join('、')}` : ''}）`).join('；')}</p>;
}

export function TeacherRecords({ records, statistics, members, questions = undefined }) {
    const byId = new Map((members as Member[]).map(m => [m.id, m]));
    if (!records?.length)
        return <p className="tr-muted">還沒有完成的題目。</p>;
    return <div className="tr-root">
      {records.map((run, index) => {
        const stat = statistics?.find(s => s.index === index);
        const options: Option[] = (run.distribution?.length ? run.distribution : stat?.distribution) || [];
        const answers = Object.keys(run.answers || {});
        const ai = answers.filter(id => byId.get(id)?.actor_type === 'llm_student').length;
        return <section className="tr-question" key={run.id || index}>
          <header className="tr-head"><small>情境 {index + 1}</small><h3>{stat?.title || questions?.[index]?.title || `第 ${index + 1} 題`}</h3>
            <div className="tr-kpis"><span><b>{answers.length}</b> 人作答</span><span><b>{answers.length - ai}</b> 真人 · <b>{ai}</b> AI</span><span><b>{(run.focuses || []).length}</b> 段深入討論</span></div></header>
          <Distribution options={options}/>
          <Shifts run={run} options={options} members={byId}/>
          <Focuses run={run} options={options} members={byId} maxTurns={questions?.[index]?.max_focus_turns}/>
          <Personal run={run} options={options} members={byId}/>
          <ModelUse run={run}/>
        </section>;
      })}
      <details className="tr-raw"><summary>原始紀錄（JSON）</summary><pre>{JSON.stringify(records, null, 2)}</pre></details>
    </div>;
}
