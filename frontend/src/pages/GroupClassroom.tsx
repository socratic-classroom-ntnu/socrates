import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../api/classroomClient';
import { GroupAnalytics } from '../features/group-analytics/GroupAnalytics';
import { GroupStance } from '../features/group-analytics/GroupStance';
import { GroupAvatar } from '../features/classroom-stage/GroupAvatar';
import { ClassroomAISettings } from '../features/ai-settings/ClassroomAISettings';
import { FocusNotice } from '../components/FocusNotice';
import { PersonalCounts, PersonalPanel, PersonalProgress } from '../features/personal-dialogue/PersonalDialogue';
import { aiStudentModel } from './ProviderSettings';
import { phaseLabel } from '../shared/phaseLabels';
import { useDevView } from '../features/dev-console/devConsoleStore';
import '../styles/group.css';
const message = (error) => error instanceof Error ? error.message : String(error);
function useView(id, mode) {
    const [view, setView] = useState(null), [error, setError] = useState('');
    const revision = useRef(0);
    useDevView('分組教室畫面 /groups/classrooms/:id', view);
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
const settled = (e) => e instanceof ApiError && e.status > 0 && e.status < 500;
/** Keep the exact action identity until its receipt is observed.
 * 上一個操作逾時或 5xx 時結果未知，保留原內容與 action_id。之後送出不同內容時，先用原內容
 * （同一個 action_id）重送一次取得它的回執，再送新內容，不會卡在提示裡。 */
function useMutation() {
    const pending = useRef(null), lock = useRef(false);
    const [busy, setBusy] = useState(false), [note, setNoteState] = useState('');
    // 呼叫端在 send 回傳後要立刻拿到這次的訊息（state 要到下一次 render 才更新）。
    const latest = useRef('');
    const setNote = (text) => { latest.current = text; setNoteState(text); };
    async function send(path, body) {
        const key = JSON.stringify([path, body]);
        if (lock.current)
            return false;
        lock.current = true; setBusy(true);
        try {
            const prior = pending.current;
            if (prior && prior.key !== key) {
                setNote('正在確認上一個操作的結果…');
                try {
                    await api(prior.path, 'POST', { ...prior.body, action_id: prior.id });
                }
                catch (e) {
                    // 4xx：原操作已被拒絕、沒有生效，可以直接送新內容；其他錯誤仍無法確認，保留原操作。
                    if (!settled(e)) {
                        setNote(message(e) + '；上一個操作的結果還無法確認，請稍後再試。');
                        return false;
                    }
                }
                pending.current = null;
            }
            pending.current ??= { key, path, body, id: crypto.randomUUID() };
            await api(path, 'POST', { ...body, action_id: pending.current.id });
            pending.current = null;
            setNote('操作已保存。');
            return true;
        }
        catch (e) {
            if (settled(e)) {
                pending.current = null;
                setNote(message(e));
            }
            else
                setNote(message(e) + '；可以直接再試一次，系統會先確認這個操作有沒有保存。');
            return false;
        }
        finally {
            lock.current = false; setBusy(false);
        }
    }
    return { send, busy, note, setNote, lastNote: () => latest.current };
}
/** 分組容量：入座人數（含 AI 學生）與「組數 × 每組人數」，以及手動指定到同一組超過每組人數的組別。 */
export function groupCapacity(roster, count, size, assignment) {
    const people = roster.length, capacity = count * size;
    const sizes = new Map();
    for (const group of Object.values(assignment))
        sizes.set(group, (sizes.get(group) || 0) + 1);
    const overfull = [...sizes].filter(([group, n]) => group >= 0 && n > size).map(([group]) => group + 1).sort((a, b) => a - b);
    const neededGroups = Math.ceil(people / size);
    return { people, capacity, overfull, enough: people <= capacity && !overfull.length, neededGroups, adjustable: neededGroups <= 40 };
}
export function GroupClassroomGate({ user, id, Legacy }) {
    const mode = new URLSearchParams(location.search).get('mode') || 'student';
    const { view, error, refresh } = useView(id, mode);
    useEffect(() => { if (view?.route?.group_id)
        location.replace(`/classrooms/${view.route.group_id}?mode=student`); }, [view?.route?.group_id]);
    if (!view)
        return <main className="sc-loading"><h2>正在讀取教室</h2><p role="status">{error || '教室與組別資料正在同步。'}</p><button onClick={() => void refresh()}>重新讀取</button></main>;
    if (view.kind === 'Legacy')
        return <Legacy user={user} id={id}/>;
    if (view.kind === 'GroupCollection' && view.role === 'teacher')
        return <GroupCollection view={view} refresh={refresh}/>;
    if (view.kind === 'GroupRun') {
        // 分組課堂只有 native-group-stage 一種 runtime；確認觀點與最後反思用獨立舞台。
        const standalone = ['final_reflection', 'viewpoint_review'].includes(view.phase);
        // 個人對話開放中（後端 personal.open）或個人階段：學生只看自己的對話，不看全班畫面。
        const personalStage = view.role === 'student' && (view.personal?.open || view.phase === 'personal');
        return <>{standalone ? <GroupStage view={view}/> : personalStage ? <PersonalStage view={view} refresh={refresh}/> : <Legacy user={user} id={id}/>}<EvidencePanel view={view} refresh={refresh} standalone={standalone}/></>;
    }
    return <main className="sc-loading"><h2>正在前往你的組別</h2><p>{error}</p></main>;
}
/** 後端 unavailable_actions 的原因碼 → 老師看得懂的說明。 */
const ACTION_REASON = {
    LOBBY_REQUIRED: '課堂已開始，分組與名單不能再調整。',
    CURRENT_POPULATED_ROSTER_REQUIRED: '還沒有學生入座，學生或 AI 學生加入並儲存分組後才能開始。',
    CURRENT_GROUP_CONFIGURATION_REQUIRED: '請先按「1. 儲存分組」保存目前的名單與分組（名單或分組設定變更後要重新儲存）。',
    AI_STUDENTS_DISABLED: 'AI 學生功能目前未開放。',
    AI_STUDENTS_REQUIRED: '目前沒有 AI 學生。',
};
const MISSING_ACTIONS = '後端未提供可用動作，請重新整理頁面。';
/** 可用動作只看後端給的 available_actions／unavailable_actions；後端沒給時一律停用，不在前端推導。 */
export function actionGate(view) {
    const available = Array.isArray(view?.available_actions) ? view.available_actions : null;
    const unavailable = view?.unavailable_actions || {};
    return {
        can: (action) => !!available?.includes(action),
        reason: (action) => (available ? unavailable[action] || null : 'ACTIONS_MISSING'),
        text: (action) => { if (!available)
            return MISSING_ACTIONS; const code = unavailable[action]; return code ? (ACTION_REASON[code] || `目前不能執行（${code}）。`) : ''; },
    };
}
function GroupCollection({ view, refresh }) {
    const [count, setCount] = useState(view.configuration?.group_count || 1);
    const [size, setSize] = useState(view.configuration?.members_per_group || 1);
    const [assignment, setAssignment] = useState({});
    const [pack, setPack] = useState(view.configuration?.avatar_pack_id || 'stickman');
    const [aiCount, setAICount] = useState(1);
    const [catalog, setCatalog] = useState([{ id: 'stickman', name: 'Stickman · 教室基本角色' }]);
    const gate = actionGate(view);
    const [acceptAlias, setAcceptAlias] = useState(false), [analysis, setAnalysis] = useState(false);
    const [batchNote, setBatchNote] = useState('');
    const batch = useRef(new Map());
    const mutation = useMutation();
    const [profiles, setProfiles] = useState(null);
    const [aiNote, setAINote] = useState('');
    const profileId = view.ai_settings?.default_profile_id || null;
    useEffect(() => { let live = true; void api('/provider-profiles').then(rows => { if (live)
        setProfiles(Array.isArray(rows) ? rows : []); }).catch(() => { if (live)
        setProfiles([]); }); return () => { live = false; }; }, []);
    const aiStudents = (view.roster || []).filter(m => m.actor_type === 'llm_student').length;
    const rosterRows = view.roster || [];
    const fit = groupCapacity(rosterRows, count, size, assignment);
    useEffect(() => { const abort = new AbortController(); fetch('/avatar-packs/catalog.json', { signal: abort.signal }).then(r => { if (!r.ok)
        throw Error('catalog'); return r.json(); }).then(x => setCatalog([{ id: 'stickman', name: 'Stickman · 教室基本角色' }, ...(x.packs || []).map((p) => ({ id: p.id, name: p.name }))])).catch(() => undefined); return () => abort.abort(); }, []);
    // 「已儲存分組」＝目前畫面上的名單與分組，等於最後一次成功儲存（或後端已確認可開始時載入）的那一份。
    const localKey = JSON.stringify([view.roster_digest, count, size, pack, assignment]);
    const [savedKey, setSavedKey] = useState(() => (gate.can('start') ? localKey : null));
    const configured = savedKey === localKey;
    // AI 學生功能由後端 feature flag 決定（view.features.ai_students；舊版後端看 unavailable_actions 的 AI_STUDENTS_DISABLED）；關閉時整組 AI 控制項不出現。
    const aiFeature = view.features?.ai_students;
    const aiEnabled = aiFeature ? aiFeature.enabled !== false : gate.reason('add_ai_students') !== 'AI_STUDENTS_DISABLED';
    const aiAddBlocked = !gate.can('add_ai_students');
    async function addAI(countToAdd) {
        if (countToAdd < 1)
            return;
        // 課堂沒有自訂 AI 連線時沿用帳號 AI 設定（預設連線＋「AI 學生」角色的模型），和上課時的解析順序一致。
        let useProfileId = profileId, matrixModel = view.ai_settings?.model_matrix?.ai_student;
        if (!useProfileId) {
            const account = await api('/ai-settings/account').catch(() => null);
            useProfileId = account?.default_profile_id || null;
            matrixModel = matrixModel || account?.model_matrix?.ai_student;
        }
        // 模型依預設連線的服務決定（與 AI 連線設定的模型選單同一套規則），非 OpenRouter 連線不送 OpenRouter 模型。
        const profile = useProfileId ? profiles?.find(p => p.id === useProfileId) : null;
        if (useProfileId && !profile) {
            setAINote(profiles ? '找不到預設的 AI 連線，請到 AI 連線設定重新選擇。' : '正在讀取 AI 連線，請稍後再試。');
            return;
        }
        const model = aiStudentModel(matrixModel, profile);
        if (!model) {
            setAINote('這個 AI 連線還沒有預設模型，請先到 AI 連線設定選擇 AI 學生的模型。');
            return;
        }
        setAINote(`正在加入 ${countToAdd} 位 AI 學生…`);
        if (await mutation.send(`/groups/classrooms/${view.id}/ai-students`, {
            count: countToAdd,
            model,
            provider_profile_id: useProfileId
        })) {
            await refresh();
            setAINote(`已加入 ${countToAdd} 位 AI 學生（模型 ${model}）。`);
        }
        else
        {
            // 失敗原因只顯示在 AI 學生按鈕旁，不在頁尾重複一次。
            setAINote(`加入 AI 學生沒有成功：${mutation.lastNote()}`);
            mutation.setNote('');
        }
    }
    async function clearAI() {
        setAINote('正在清除 AI 學生…');
        if (await mutation.send(`/groups/classrooms/${view.id}/ai-students/clear`, {})) {
            await refresh();
            setAINote('已清除所有 AI 學生。');
        }
        else
        {
            setAINote(`清除 AI 學生沒有成功：${mutation.lastNote()}`);
            mutation.setNote('');
        }
    }
    async function configure() {
        if (await mutation.send(`/groups/classrooms/${view.id}/configure`, {
            expected_roster_digest: view.roster_digest, group_count: count, members_per_group: size, assignments: assignment, avatar_pack_id: pack
        })) {
            setSavedKey(localKey);
            await refresh();
        }
    }
    // 「開始課堂」不能按時，直接說明原因。
    const startBlocked = mutation.busy ? '正在處理上一個操作，請稍候。'
        : !gate.can('start') && gate.reason('start') !== 'CURRENT_GROUP_CONFIGURATION_REQUIRED' ? gate.text('start')
            : !fit.enough ? '分組容量不足，請先調整組數或每組人數，再按「1. 儲存分組」。'
                : !configured ? '請先按「1. 儲存分組」保存目前的名單與分組（名單或分組設定變更後要重新儲存）。' : '';
    async function start() { if (await mutation.send(`/groups/classrooms/${view.id}/start`, { expected_roster_digest: view.roster_digest, accept_temporary_aliases: acceptAlias }))
        await refresh(); }
    async function batchNext() {
        const rows = view.groups || [];
        setBatchNote('正在更新各組進度…');
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
    return <main className="sc-home group-room" data-group-collection><header className="sc-top"><a href="/" className="sc-wordmark">Socrates<span>共思教室</span></a><span>{view.title}</span><a href="/teacher/home">返回我的課程</a></header>
    <section className="sc-home-hero"><small>教師端 · 課堂準備</small><h1>{view.title}</h1><p>分享加入代碼，確認名單與分組，接著開始課堂。</p></section>
    {view.phase === 'lobby' ? <section className="sc-glass"><div className="sc-row"><div className="sc-code-display">{view.code}</div><button className="quiet" onClick={() => void navigator.clipboard.writeText(view.code).then(() => setBatchNote('加入代碼已複製')).catch(() => setBatchNote('請選取上方代碼並複製。'))}>複製加入代碼</button></div><p role="status">{batchNote}</p><p>{view.roster?.length || 0} 位學生已入座</p>
      <div className="sc-grid"><label>組數<input type="number" min={1} max={40} value={count} onChange={e => setCount(Math.max(1, Math.min(40, +e.target.value)))}/></label>
      <label>每組人數<input type="number" min={1} max={40} value={size} onChange={e => setSize(Math.max(1, Math.min(40, +e.target.value)))}/></label>
      </div><p role="status" aria-live="polite">目前 {fit.people} 人（含 AI）／容量 {count}×{size}＝{fit.capacity} 人</p>
      {!fit.enough && <div className="sc-row" role="alert"><p>{fit.people > fit.capacity ? `分組容量不足：還差 ${fit.people - fit.capacity} 個座位。請增加組數或每組人數，或按「自動調整組數」。` : `第 ${fit.overfull.join('、')} 組手動指定的學生超過每組人數，請改派組別或增加每組人數。`}{fit.people > fit.capacity && !fit.adjustable ? '每組人數太少，組數最多 40 組，請先增加每組人數。' : ''}</p>{fit.people > fit.capacity && fit.adjustable && <button type="button" className="quiet" onClick={() => setCount(fit.neededGroups)}>自動調整組數</button>}</div>}<details><summary>{aiEnabled ? 'AI 學生與教室角色（選用）' : '教室角色（選用）'}</summary><div className="sc-grid">{aiEnabled && <label>AI 學生數<input type="number" min={1} max={40} value={aiCount} onChange={e => setAICount(Math.max(1, Math.min(40, +e.target.value)))}/></label>}
      <label>教室角色<select value={pack} onChange={e => setPack(e.target.value)}>{catalog.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
      {aiEnabled && <><p>AI 學生可與真人共同討論；加入後一起安排分組。</p>
      <div className="sc-row ai-roster-controls"><button disabled={mutation.busy || aiAddBlocked} onClick={() => void addAI(aiCount)}>加入 AI 學生</button><button disabled={mutation.busy || aiAddBlocked || Math.max(0, count * size - (view.roster?.length || 0)) === 0} onClick={() => void addAI(Math.max(0, count * size - (view.roster?.length || 0)))}>補滿剩餘席位</button><button className="quiet" disabled={mutation.busy || !gate.can('clear_ai_students')} onClick={() => void clearAI()}>清除 AI 學生</button></div>
      <p>{(view.roster || []).length > 0 && (view.roster || []).every(m => m.actor_type === 'llm_student') ? '目前都是 AI 學生；開課後會自動進行討論。' : '真人與 AI 學生皆可加入同一組。'}</p>
      <p className="ai-roster-status" role="status" aria-live="polite">目前 AI 學生 {aiStudents} 位{aiNote ? ` · ${aiNote}` : ''}</p></>}</details>
      <details className="sc-card"><summary>進階 AI 設定（選用）</summary><ClassroomAISettings classroomId={view.asset_classroom_id} activeRoomId={view.id} onSaved={() => void refresh()}/></details>
      <div className="sc-script-grid">{(view.roster || []).map((m, i) => <article className="sc-card" key={m.id}><strong>{m.alias.startsWith('~pending-') ? `學生 ${i + 1}（暫時名稱）` : m.alias}{m.actor_type === 'llm_student' && <small className="ai-badge">AI</small>}</strong>
        <label>組別<select value={assignment[m.id] ?? m.group ?? -1} onChange={e => setAssignment({ ...assignment, [m.id]: +e.target.value })}><option value={-1} disabled>自動平均分組</option>{Array.from({ length: count }, (_, g) => <option key={g} value={g}>第 {g + 1} 組</option>)}</select></label></article>)}</div>
      <label className="group-check"><input type="checkbox" checked={acceptAlias} onChange={e => setAcceptAlias(e.target.checked)}/>開課時，待填暱稱使用「學生 N」。</label>
      <div className="sc-row"><button disabled={mutation.busy || !fit.enough || !gate.can('configure')} onClick={() => void configure()}>1. 儲存分組</button><button disabled={!!startBlocked} aria-describedby={startBlocked ? 'group-start-reason' : undefined} onClick={() => void start()}>2. 開始課堂 →</button></div>{startBlocked && <p id="group-start-reason" className="muted">無法開始課堂：{startBlocked}</p>}<p role="status">{mutation.note || (configured ? '分組已保存，可以開始課堂。' : ((view.roster || []).length ? '先按「儲存分組」，確認後即可開始課堂。' : '學生加入後即可儲存分組，也可展開上方選用設定加入 AI 學生。'))}</p>
    </section> : <><div className="sc-row"><button onClick={() => setAnalysis(!analysis)}>{analysis ? '返回組別' : '全班 → 組別 → 個人分析'}</button><button onClick={() => void batchNext()}>推進各組到下一步</button></div><p role="status">{batchNote}</p>
      {analysis ? <GroupAnalytics id={view.id}/> : <div className="sc-script-grid">{(view.groups || []).map(g => <a className="sc-card group-card" key={g.id} href={`/classrooms/${g.id}?mode=teacher`}><small>{phaseLabel(g.phase)}</small><h2>{g.label}</h2><GroupStance stance={g.stance}/><PersonalCounts progress={g.personal_progress}/><p>{g.acked} / {g.members} 人確認觀點</p><meter min={0} max={g.members} value={g.acked}/><p>{g.settlement === 'SETTLED' ? '全組已確認' : '等待全組確認觀點'}</p><span>進入本組 →</span></a>)}</div>}</>}
  </main>;
}
/** 逐字稿裡最後一則導師訊息（人像念出它）；id 用位置，新訊息進來才會念。 */
export function lastTutorLine(transcript?: { messages: { role: string; text: string }[] }[]) {
    const flat = (transcript || []).flatMap((f, fi) => f.messages.map((m, i) => ({ ...m, id: `${fi}-${i}` })));
    const last = [...flat].reverse().find(m => m.role === 'tutor');
    return last ? { id: last.id, text: last.text } : null;
}
function GroupStage({ view }) {
    return <main className="sc-home group-room group-stage"><header className="sc-top"><a className="sc-wordmark" href="/">Socrates</a><span>{view.group_label} · {phaseLabel(view.phase)}</span>{view.role === 'teacher' && <a href={`/classrooms/${view.classroom_id}?mode=teacher`}>全班</a>}</header>
    <section className="sc-home-hero"><small>{view.source_mode} · GROUP DIALOGUE</small><h1>{view.question?.title || view.title}</h1><p>{view.question?.scenario}</p></section>
    <GroupAvatar packId={view.avatar_pack_id || 'stickman'} say={lastTutorLine(view.transcript)}/>
    <FocusNotice status={view.focus_notice ? 'TUTOR_UNAVAILABLE' : null} message={view.focus_notice}/>
    <section className="group-transcript">{(view.transcript || []).flatMap((f, fi) => f.messages.map((m, i) => <article className={'sc-card ' + m.role} key={`${fi}-${i}`}><small>{m.role === 'tutor' ? '導師' : view.members?.find(x => x.id === f.member_id)?.alias || '同學'}</small><p>{m.text}</p></article>))}</section>
  </main>;
}
function PersonalStage({ view, refresh }) {
    const mutation = useMutation();
    async function send(kind, data = {}) {
        const ok = await mutation.send(`/groups/runs/${view.id}/commands`, { kind, data });
        if (ok)
            await refresh();
        return ok;
    }
    return <main className="sc-classroom"><header className="sc-top"><a className="sc-wordmark" href="/">Socrates</a><span>{view.group_label} · {view.title}</span></header>
    {view.personal ? <PersonalPanel question={view.question} personal={view.personal} actions={view.available_actions || []} send={send} busy={mutation.busy} note={mutation.note}/> : <section className="sc-lobby"><small>個人對話</small><h1>{view.question?.title}</h1><p>本題作答時間已結束，其他同學正在與導師個別對話。請稍候，老師會帶大家進入討論。</p></section>}
  </main>;
}
function EvidencePanel({ view, refresh, standalone }) {
    const [text, setText] = useState(''), [parent, setParent] = useState(''), [relation, setRelation] = useState('qualifies'), [open, setOpen] = useState(standalone || (view.role === 'teacher' && ['answering', 'personal'].includes(view.phase)));
    const [username, setUsername] = useState({}), [ackCheck, setAckCheck] = useState(false);
    const mutation = useMutation();
    const settled = view.settlement?.state === 'SETTLED';
    const [confirmEnd, setConfirmEnd] = useState(false);
    // 老師端按鈕只依後端 available_actions（group_teacher_actions）；舊版後端沒給時「下一步」照舊顯示。
    const teacherCan = (action) => actionGate(view).can(action);
    async function teacherCommand(kind) {
        const ok = await mutation.send(`/groups/runs/${view.id}/commands`, { kind, data: {} });
        if (ok) {
            setConfirmEnd(false);
            await refresh();
        }
    }
    // 可用動作由後端 available_actions 決定（group_run.student_actions），前端不由階段推導。
    const actions = view.available_actions || [];
    const allowed = actions.includes('group_statement');
    const confirmed = !!view.member_id && view.confirmed_members?.includes(view.member_id);
    const confirmable = actions.includes('group_ack');
    useEffect(() => setAckCheck(false), [view.my_summary?.digest]);
    async function send() { if (await mutation.send(`/groups/runs/${view.id}/commands`, { kind: 'group_statement', data: { text, parents: parent ? [parent] : [], relation } })) {
        setText('');
        await refresh();
    } }
    // 老師端的個人對話重試：按鈕只依後端每列給的 actions 顯示。
    async function teacherSend(kind, data = {}) {
        const ok = await mutation.send(`/groups/runs/${view.id}/commands`, { kind, data });
        if (ok)
            await refresh();
        return ok;
    }
    async function ack() { if (await mutation.send(`/groups/runs/${view.id}/commands`, { kind: 'group_ack', data: { summary_digest: view.my_summary?.digest } }))
        await refresh(); }
    return <section className={'group-evidence ' + (standalone ? 'inline' : 'floating')}><button className="quiet" onClick={() => setOpen(!open)}>本組觀點與確認 {open ? '收合' : '展開'} · {view.confirmed_members?.length || 0}/{view.members?.length || 0}</button>
    {open && <><h2>{view.group_label} · 原話與觀點</h2><p>{view.settlement?.state === 'FINAL_STAGE' ? '最終反思階段：持續保存補充，階段結束後結算。' : settled ? '本組對話與確認證據已保存。' : '確認後可繼續補充；全組確認後，再完整進行一個最終舞台階段。'}</p>
      <div className="group-memberline">{view.members?.map(m => <span key={m.id} tabIndex={view.role === 'teacher' ? 0 : undefined} title={username[m.id]} onMouseEnter={() => { if (view.role === 'teacher')
            void api(`/groups/runs/${view.id}/members/${m.id}/identity`).then(x => setUsername(v => ({ ...v, [m.id]: x.username }))).catch(() => undefined); }} onFocus={() => { if (view.role === 'teacher')
            void api(`/groups/runs/${view.id}/members/${m.id}/identity`).then(x => setUsername(v => ({ ...v, [m.id]: x.username }))).catch(() => undefined); }}>{m.alias}{view.confirmed_members?.includes(m.id) ? ' · 已確認' : ''}</span>)}</div>
      <div className="group-quotes">{view.arguments?.map(n => <blockquote key={n.id}><small>{view.members?.find(m => m.id === n.member_id)?.alias} · {n.kind} · {n.stage}</small><p>{n.text}</p></blockquote>)}</div>
      {view.role === 'student' && allowed && !settled && <><label>我的補充<textarea rows={3} maxLength={12000} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
            } }}/></label>
        <div className="sc-grid"><label>回應哪一則<select value={parent} onChange={e => setParent(e.target.value)}><option value="">新的起點</option>{view.arguments?.map(n => <option key={n.id} value={n.id}>{n.text.slice(0, 55)}</option>)}</select></label><label>論點關係<select value={relation} onChange={e => setRelation(e.target.value)}><option value="supports">支持</option><option value="challenges">質疑</option><option value="qualifies">補充條件</option><option value="revises">修正</option></select></label></div>
        <button disabled={mutation.busy || !text.trim()} onClick={() => void send()}>保存原話</button>
        {!confirmed && !!view.my_summary?.quotes.length && !confirmable && <p className="muted">所有題目與代表討論結束後，才能確認自己的觀點。</p>}
        {!confirmed && !!view.my_summary?.quotes.length && confirmable && <details><summary>回讀我的原話並確認</summary>{view.my_summary.quotes.map(q => <blockquote key={q.id}>{q.text}</blockquote>)}<label className="group-check"><input type="checkbox" checked={ackCheck} onChange={e => setAckCheck(e.target.checked)}/>這確實是我目前的真實觀點。</label><button disabled={mutation.busy || !ackCheck} onClick={() => void ack()}>確認這份觀點快照</button></details>}
      </>}
      {view.role === 'teacher' && <PersonalProgress progress={view.personal_progress} overview={view.personal_overview} send={teacherSend} busy={mutation.busy}/>}
      {view.role === 'teacher' && !settled && <div className="sc-row">
        {teacherCan('next') && <button disabled={mutation.busy} onClick={() => void teacherCommand('next')}>本組：下一步</button>}
        {teacherCan('end') && (confirmEnd
            ? <span className="group-end-confirm" role="group" aria-label="確認結束本組課堂"><span>{view.members?.length && (view.confirmed_members?.length || 0) < view.members.length ? `還有 ${view.members.length - (view.confirmed_members?.length || 0)} 位學生未確認觀點，結束後會記為未完成。` : '結束後本組不能再補充。'}</span><button className="danger" disabled={mutation.busy} onClick={() => void teacherCommand('end')}>確定結束</button><button className="quiet" disabled={mutation.busy} onClick={() => setConfirmEnd(false)}>取消</button></span>
            : <button className="quiet" disabled={mutation.busy} onClick={() => setConfirmEnd(true)}>結束本組課堂</button>)}
      </div>}
      <p role="status">{mutation.note}</p></>}
  </section>;
}
