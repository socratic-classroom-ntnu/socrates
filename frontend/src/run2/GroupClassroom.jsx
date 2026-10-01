import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './client';
import { GroupAnalytics } from './GroupAnalytics';
import { GroupAvatar } from './GroupAvatar';
import { ClassroomAISettings } from './ClassroomAISettings';
import './group.css';
const message = (error) => error instanceof Error ? error.message : String(error);
function useView(id, mode) {
    const [view, setView] = useState(null), [error, setError] = useState('');
    const revision = useRef(0);
    const refresh = useCallback(async () => {
        const generation = ++revision.current;
        try {
            const data = await api(`/groups/classrooms/${id}?mode=${encodeURIComponent(mode)}`);
            if (generation === revision.current) {
                setView(data);
                setError('');
            }
            return data;
        }
        catch (e) {
            if (generation === revision.current)
                setError(message(e));
            return null;
        }
    }, [id, mode]);
    useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 2000); return () => { clearInterval(timer); revision.current++; }; }, [refresh]);
    return { view, error, refresh };
}
/** Keep the exact action identity until its receipt is observed. */
function useMutation() {
    const pending = useRef(null);
    const [busy, setBusy] = useState(false), [note, setNote] = useState('');
    async function send(path, body) {
        const key = JSON.stringify([path, body]);
        if (busy)
            return false;
        if (pending.current && pending.current.key !== key) {
            setNote('先以原內容取得上一筆回執，再送出新內容。');
            return false;
        }
        pending.current ??= { key, id: crypto.randomUUID() };
        setBusy(true);
        try {
            await api(path, 'POST', { ...body, action_id: pending.current.id });
            pending.current = null;
            setNote('已取得伺服器回執。');
            return true;
        }
        catch (e) {
            if (e.status && e.status < 500)
                pending.current = null;
            setNote(message(e) + '；再次按同一操作即可配對原 action。');
            return false;
        }
        finally {
            setBusy(false);
        }
    }
    return { send, busy, note };
}
export function GroupClassroomGate({ user, id, Legacy }) {
    const mode = new URLSearchParams(location.search).get('mode') || 'student';
    const { view, error, refresh } = useView(id, mode);
    useEffect(() => { if (view?.route?.group_id)
        location.replace(`/classrooms/${view.route.group_id}?mode=student`); }, [view?.route?.group_id]);
    if (!view)
        return <main className="r2-loading"><h2>正在讀取教室</h2><p role="status">{error || '教室與組別資料正在同步。'}</p><button onClick={() => void refresh()}>重新讀取</button></main>;
    if (view.kind === 'Legacy')
        return <Legacy user={user} id={id}/>;
    if (view.kind === 'GroupCollection' && view.role === 'teacher')
        return <GroupCollection view={view} refresh={refresh}/>;
    if (view.kind === 'GroupRun') {
        const standalone = view.runtime_mode === 'individual-free-text' || ['final_reflection', 'viewpoint_review'].includes(view.phase);
        return <>{standalone ? <GroupStage view={view}/> : <Legacy user={user} id={id}/>}<EvidencePanel view={view} refresh={refresh} standalone={standalone}/></>;
    }
    return <main className="r2-loading"><h2>正在前往你的組別</h2><p>{error}</p></main>;
}
function GroupCollection({ view, refresh }) {
    const [count, setCount] = useState(view.configuration?.group_count || 1);
    const [size, setSize] = useState(view.configuration?.members_per_group || 1);
    const [assignment, setAssignment] = useState({});
    const [pack, setPack] = useState(view.configuration?.avatar_pack_id || 'stickman');
    const [aiCount, setAICount] = useState(1);
    const [catalog, setCatalog] = useState([{ id: 'stickman', name: 'Stickman · 教室基本角色' }]);
    const [acceptAlias, setAcceptAlias] = useState(false), [configured, setConfigured] = useState(false), [analysis, setAnalysis] = useState(false);
    const [batchNote, setBatchNote] = useState('');
    const batch = useRef(new Map());
    const mutation = useMutation();
    useEffect(() => { const abort = new AbortController(); fetch('/avatar-packs/catalog.json', { signal: abort.signal }).then(r => { if (!r.ok)
        throw Error('catalog'); return r.json(); }).then(x => setCatalog([{ id: 'stickman', name: 'Stickman · 教室基本角色' }, ...(x.packs || []).map((p) => ({ id: p.id, name: p.name }))])).catch(() => undefined); return () => abort.abort(); }, []);
    useEffect(() => { setConfigured(false); }, [view.roster_digest, count, size, pack, assignment]);
    async function addAI(countToAdd) {
        if (countToAdd < 1)
            return;
        if (await mutation.send(`/groups/classrooms/${view.id}/ai-students`, {
            count: countToAdd,
            model: view.ai_settings?.model_matrix?.ai_student || 'openrouter/free',
            provider_profile_id: view.ai_settings?.default_profile_id || null
        }))
            await refresh();
    }
    async function clearAI() {
        if (await mutation.send(`/groups/classrooms/${view.id}/ai-students/clear`, {}))
            await refresh();
    }
    async function configure() {
        if (await mutation.send(`/groups/classrooms/${view.id}/configure`, {
            expected_roster_digest: view.roster_digest, group_count: count, members_per_group: size, assignments: assignment, avatar_pack_id: pack
        })) {
            await refresh();
            setConfigured(true);
        }
    }
    async function start() { if (await mutation.send(`/groups/classrooms/${view.id}/start`, { expected_roster_digest: view.roster_digest, accept_temporary_aliases: acceptAlias }))
        await refresh(); }
    async function batchNext() {
        const rows = view.groups || [];
        setBatchNote('逐組配對 action 與回執…');
        if ([...batch.current.values()].every(x => x.done))
            batch.current.clear();
        const outcomes = [];
        for (const group of rows) {
            if (group.settlement === 'SETTLED')
                continue;
            const pending = batch.current.get(group.id) || { action_id: crypto.randomUUID(), done: false };
            batch.current.set(group.id, pending);
            if (pending.done) {
                outcomes.push(`${group.label}：已取得原回執`);
                continue;
            }
            try {
                await api(`/groups/runs/${group.id}/commands`, 'POST', { action_id: pending.action_id, kind: 'next', data: {} });
                pending.done = true;
                outcomes.push(`${group.label}：已推進`);
            }
            catch (e) {
                outcomes.push(`${group.label}：${message(e)}`);
            }
        }
        setBatchNote(outcomes.join('；'));
        await refresh();
    }
    return <main className="r2-home g70" data-r70-groups><header className="r2-top"><a href="/" className="r2-wordmark">Socrates<span>共思教室</span></a><span>{view.title}</span><a href="/">教師工作室</a></header>
    <section className="r2-home-hero"><small>CLASSROOM · GROUPS</small><h1>同一個起點，各自的思考。</h1><p>每組保存自己的對話、進度與觀點。教師可查看單組，再回到全班比較。</p></section>
    {view.phase === 'lobby' ? <section className="r2-glass"><div className="r2-code-display">{view.code}</div><p>{view.roster?.length || 0} 位學生已入座</p>
      <div className="r2-grid"><label>組數<input type="number" min={1} max={40} value={count} onChange={e => setCount(Math.max(1, Math.min(40, +e.target.value)))}/></label>
      <label>每組人數<input type="number" min={1} max={40} value={size} onChange={e => setSize(Math.max(1, Math.min(40, +e.target.value)))}/></label>
      <label>AI 學生數<input type="number" min={1} max={40} value={aiCount} onChange={e => setAICount(Math.max(1, Math.min(40, +e.target.value)))}/></label>
      <label>教室角色<select value={pack} onChange={e => setPack(e.target.value)}>{catalog.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
      <p>每組各自擁有倒數、作答與舞台；每組一人沿同一個人舞台流程。先保存分組，確認名單後開課。</p>
      <div className="r2-row r88-ai-roster-controls"><button disabled={mutation.busy} onClick={() => void addAI(aiCount)}>加入 AI 學生</button><button disabled={mutation.busy || Math.max(0, count * size - (view.roster?.length || 0)) === 0} onClick={() => void addAI(Math.max(0, count * size - (view.roster?.length || 0)))}>補滿剩餘席位</button><button className="quiet" disabled={mutation.busy || !(view.roster || []).some(m => m.actor_type === 'llm_student')} onClick={() => void clearAI()}>清除 AI 學生</button></div>
      <p>{(view.roster || []).length > 0 && (view.roster || []).every(m => m.actor_type === 'llm_student') ? '目前名單為全 AI；開始課堂後會沿同一狀態機自動完成一局。' : '真人與 AI 學生可共同分組，全部為 AI 時自然成為自動局。'}</p>
      <ClassroomAISettings classroomId={view.asset_classroom_id} activeRoomId={view.id} onSaved={() => void refresh()}/>
      <div className="r2-script-grid">{(view.roster || []).map((m, i) => <article className="r2-card" key={m.id}><strong>{m.alias.startsWith('~pending-') ? `學生 ${i + 1}（暫時名稱）` : m.alias}{m.actor_type === 'llm_student' && <small className="r88-ai-badge">AI</small>}</strong>
        <label>組別<select value={assignment[m.id] ?? m.group ?? -1} onChange={e => setAssignment({ ...assignment, [m.id]: +e.target.value })}><option value={-1} disabled>自動平均分組</option>{Array.from({ length: count }, (_, g) => <option key={g} value={g}>Group {g + 1}</option>)}</select></label></article>)}</div>
      <label className="g70-check"><input type="checkbox" checked={acceptAlias} onChange={e => setAcceptAlias(e.target.checked)}/>開課時，待填暱稱使用「學生 N」。</label>
      <div className="r2-row"><button disabled={mutation.busy} onClick={() => void configure()}>保存／重新平均分組</button><button disabled={mutation.busy || !configured} onClick={() => void start()}>開始課堂 →</button></div><p role="status">{mutation.note}</p>
    </section> : <><div className="r2-row"><button onClick={() => setAnalysis(!analysis)}>{analysis ? '返回組別' : '全班 → 組別 → 個人分析'}</button><button onClick={() => void batchNext()}>全部組：下一個安全節點</button></div><p role="status">{batchNote}</p>
      {analysis ? <GroupAnalytics id={view.id}/> : <div className="r2-script-grid">{(view.groups || []).map(g => <a className="r2-card g70-group" key={g.id} href={`/classrooms/${g.id}?mode=teacher`}><small>{g.phase}</small><h2>{g.label}</h2><p>{g.acked} / {g.members} 人確認觀點</p><meter min={0} max={g.members} value={g.acked}/><p>{g.settlement}</p><span>進入本組 →</span></a>)}</div>}</>}
  </main>;
}
function GroupStage({ view }) {
    return <main className="r2-home g70 g70-stage"><header className="r2-top"><a className="r2-wordmark" href="/">Socrates</a><span>{view.group_label} · {view.phase}</span>{view.role === 'teacher' && <a href={`/classrooms/${view.classroom_id}?mode=teacher`}>全班</a>}</header>
    <section className="r2-home-hero"><small>{view.source_mode} · GROUP DIALOGUE</small><h1>{view.question?.title || view.title}</h1><p>{view.question?.scenario}</p></section>
    <GroupAvatar packId={view.avatar_pack_id || 'stickman'}/>
    <section className="g70-transcript">{(view.transcript || []).flatMap((f, fi) => f.messages.map((m, i) => <article className={'r2-card ' + m.role} key={`${fi}-${i}`}><small>{m.role === 'tutor' ? '導師' : view.members?.find(x => x.id === f.member_id)?.alias || '同學'}</small><p>{m.text}</p></article>))}</section>
  </main>;
}
function EvidencePanel({ view, refresh, standalone }) {
    const [text, setText] = useState(''), [parent, setParent] = useState(''), [relation, setRelation] = useState('qualifies'), [open, setOpen] = useState(standalone);
    const [username, setUsername] = useState({}), [ackCheck, setAckCheck] = useState(false);
    const mutation = useMutation();
    const settled = view.settlement?.state === 'SETTLED';
    const allowed = ['answering', 'distribution', 'arena', 'focus', 'focus_summary', 'question_summary', 'preview', 'viewpoint_review', 'final_reflection'].includes(view.phase);
    const confirmed = !!view.member_id && view.confirmed_members?.includes(view.member_id);
    useEffect(() => setAckCheck(false), [view.my_summary?.digest]);
    async function send() { if (await mutation.send(`/groups/runs/${view.id}/commands`, { kind: 'group_statement', data: { text, parents: parent ? [parent] : [], relation } })) {
        setText('');
        await refresh();
    } }
    async function ack() { if (await mutation.send(`/groups/runs/${view.id}/commands`, { kind: 'group_ack', data: { summary_digest: view.my_summary?.digest } }))
        await refresh(); }
    return <section className={'g70-evidence ' + (standalone ? 'inline' : 'floating')}><button className="quiet" onClick={() => setOpen(!open)}>本組觀點與確認 {open ? '收合' : '展開'} · {view.confirmed_members?.length || 0}/{view.members?.length || 0}</button>
    {open && <><h2>{view.group_label} · 原話與觀點</h2><p>{view.settlement?.state === 'FINAL_STAGE' ? '最終反思階段：持續保存補充，階段結束後結算。' : settled ? '本組對話與確認證據已保存。' : '確認後可繼續補充；全組確認後，再完整進行一個最終舞台階段。'}</p>
      <div className="g70-memberline">{view.members?.map(m => <span key={m.id} tabIndex={view.role === 'teacher' ? 0 : undefined} title={username[m.id]} onMouseEnter={() => { if (view.role === 'teacher')
            void api(`/groups/runs/${view.id}/members/${m.id}/identity`).then(x => setUsername(v => ({ ...v, [m.id]: x.username }))).catch(() => undefined); }} onFocus={() => { if (view.role === 'teacher')
            void api(`/groups/runs/${view.id}/members/${m.id}/identity`).then(x => setUsername(v => ({ ...v, [m.id]: x.username }))).catch(() => undefined); }}>{m.alias}{view.confirmed_members?.includes(m.id) ? ' · 已確認' : ''}</span>)}</div>
      <div className="g70-quotes">{view.arguments?.map(n => <blockquote key={n.id}><small>{view.members?.find(m => m.id === n.member_id)?.alias} · {n.kind} · {n.stage}</small><p>{n.text}</p></blockquote>)}</div>
      {view.role === 'student' && allowed && !settled && <><label>我的補充<textarea rows={3} maxLength={12000} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
            } }}/></label>
        <div className="r2-grid"><label>回應哪一則<select value={parent} onChange={e => setParent(e.target.value)}><option value="">新的起點</option>{view.arguments?.map(n => <option key={n.id} value={n.id}>{n.text.slice(0, 55)}</option>)}</select></label><label>論點關係<select value={relation} onChange={e => setRelation(e.target.value)}><option value="supports">支持</option><option value="challenges">質疑</option><option value="qualifies">補充條件</option><option value="revises">修正</option></select></label></div>
        <button disabled={mutation.busy || !text.trim()} onClick={() => void send()}>保存原話</button>
        {!confirmed && !!view.my_summary?.quotes.length && <details><summary>回讀我的原話並確認</summary>{view.my_summary.quotes.map(q => <blockquote key={q.id}>{q.text}</blockquote>)}<label className="g70-check"><input type="checkbox" checked={ackCheck} onChange={e => setAckCheck(e.target.checked)}/>這確實是我目前的真實觀點。</label><button disabled={mutation.busy || !ackCheck} onClick={() => void ack()}>確認這份觀點快照</button></details>}
      </>}
      {view.role === 'teacher' && !settled && <button disabled={mutation.busy} onClick={() => void mutation.send(`/groups/runs/${view.id}/commands`, { kind: 'next', data: {} }).then(ok => ok && refresh())}>本組：下一步</button>}
      <p role="status">{mutation.note}</p></>}
  </section>;
}
