import { useCallback, useEffect, useRef, useState } from 'react';
import { api, command } from '../../api/classroomClient';
import { errorMessage } from '../../api/errorText';
import { Arena } from '../classroom-stage/Arena';
import { DraftComposer } from '../../shared/input/DraftComposer';
import { useDevView } from '../dev-console/devConsoleStore';
import { AnswerWithResearch } from '../research/ResearchSidebar';
import { GroupClassroomGate } from '../group-dialogue/GroupClassroom';
import { FocusNotice } from '../../components/FocusNotice';
import { TeacherRecords } from '../teacher-records/TeacherRecords';
import { JOIN_ALIAS_MAX_LENGTH } from './limits';
function useRoom(id, mode) {
    const [room, setRoom] = useState(null), [note, setNote] = useState(''), [buffer, setBuffer] = useState('');
    const [barrage, setBarrage] = useState([]);
    useDevView('教室畫面 /classrooms/:id', room);
    const offset = useRef(0), bestRTT = useRef(Infinity), seq = useRef(0), generation = useRef(''), textBuffer = useRef('');
    const refresh = useCallback(async () => { try {
        const r = await api(`/classrooms/${id}?mode=${mode}`);
        if (r.seq >= seq.current) {
            seq.current = r.seq;
            setRoom(r);
        }
        return r;
    }
    catch (e) {
        setNote(errorMessage(e));
        return null;
    } }, [id, mode]);
    useEffect(() => {
        let stopped = false, ws, backoff = 500, refreshTimer;
        void refresh();
        const reconnect = () => {
            if (stopped)
                return;
            ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/v2/classrooms/${id}/ws?mode=${mode}&last_seq=${seq.current}`);
            ws.onopen = () => { backoff = 500; ws?.send(JSON.stringify({ type: 'ping', sent_at: Date.now() })); };
            ws.onmessage = event => {
                const e = JSON.parse(event.data);
                if (e.type === 'snapshot') {
                    seq.current = e.seq;
                    setRoom(e.room);
                    return;
                }
                if (e.type === 'pong') {
                    const received = Date.now(), sent = Number(e.echo), rtt = received - sent;
                    if (rtt < bestRTT.current) {
                        bestRTT.current = rtt;
                        offset.current = e.server_now * 1000 - (received + sent) / 2;
                    }
                    return;
                }
                if (e.type === 'tutor.buffer') {
                    generation.current = e.generation_id;
                    textBuffer.current = e.text;
                    setBuffer(e.text);
                    return;
                }
                if (e.type === 'tutor.delta') {
                    if (generation.current !== e.generation_id) {
                        generation.current = e.generation_id;
                        textBuffer.current = '';
                    }
                    if (e.offset <= textBuffer.current.length) {
                        const t = textBuffer.current.slice(0, e.offset) + e.text;
                        if (t.length > textBuffer.current.length) {
                            textBuffer.current = t;
                            setBuffer(t);
                        }
                    }
                    return;
                }
                if (e.seq && e.seq <= seq.current)
                    return;
                if (e.seq)
                    seq.current = e.seq;
                if (e.type === 'barrage') {
                    const item = { id: crypto.randomUUID(), text: e.payload.text };
                    setBarrage(x => [...x.slice(-12), item]);
                    window.setTimeout(() => setBarrage(x => x.filter(b => b.id !== item.id)), 7000);
                }
                if (e.type === 'tutor.final') {
                    textBuffer.current = '';
                    setBuffer('');
                }
                if (e.type === 'answer.closing')
                    window.dispatchEvent(new Event('sc-final-sync'));
                if (refreshTimer === undefined)
                    refreshTimer = window.setTimeout(() => { refreshTimer = undefined; void refresh(); }, 16);
            };
            ws.onclose = () => { if (!stopped) {
                window.setTimeout(reconnect, backoff);
                backoff = Math.min(5000, backoff * 2);
            } };
        };
        reconnect();
        const ping = window.setInterval(() => { if (ws?.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: 'ping', sent_at: Date.now() })); }, 5000);
        const poll = window.setInterval(() => void refresh(), 3000);
        return () => { stopped = true; ws?.close(); clearInterval(ping); clearInterval(poll); if (refreshTimer)
            clearTimeout(refreshTimer); };
    }, [id, mode, refresh]);
    return { room, note, setNote, refresh, buffer, barrage, offset };
}
function Clock({ deadline, offset }) {
    const [seconds, setSeconds] = useState(0);
    useEffect(() => { let frame = 0; const render = () => { setSeconds(deadline ? Math.max(0, deadline - (Date.now() + offset.current) / 1000) : 0); frame = requestAnimationFrame(render); }; render(); return () => cancelAnimationFrame(frame); }, [deadline, offset]);
    return deadline ? <div className="sc-clock" aria-label="全教室倒數">{Math.ceil(seconds)}<small>秒</small></div> : null;
}
function AnswerPanel({ room, refresh, setNote, offset }) {
    const [sending, setSending] = useState(false);
    const initial = room.my_draft;
    const [choice, setChoice] = useState(initial?.option_id || ''), [text, setText] = useState(initial?.text || ''), [writing, setWriting] = useState(!!initial?.option_id);
    const [ghost, setGhost] = useState(''), [suggestion, setSuggestion] = useState(initial?.suggestion || null);
    const revision = useRef(initial?.revision || 0), sent = useRef(false), finalAction = useRef(crypto.randomUUID());
    const latest = useRef({ choice, text, suggestion });
    latest.current = { choice, text, suggestion };
    useEffect(() => {
        if (choice !== '__other__') { setGhost(''); setSuggestion(null); return; }
        if (text || ghost) return;
        const question = room.question;
        void api('/suggestions/other', 'POST', {
            question_id: question?.id || room.question_run_id,
            title: question?.title || '其他觀點',
            scenario: question?.scenario || '提出另一個判斷角度。',
            existing_options: (question?.options || []).filter(o => o.id !== '__other__').map(o => o.text),
            room_id: room.id
        }).then(result => {
            setGhost(result.suggestion_text || '');
            setSuggestion({ ...result, suggestion_accepted: false, suggestion_accepted_at: null, suggestion_edited: false });
        }).catch(() => undefined);
    }, [choice, room.question_run_id, room.question, text, ghost]);
    const allowed = room.available_actions.includes('answer');
    const submit = useCallback(async () => { const v = latest.current; if (sent.current || !v.choice || !room.available_actions.includes('answer'))
        return; if (room.question?.argument_required && !v.text.trim()) { setNote('請補上你選擇的理由，再送出。'); return; } sent.current = true; setSending(true); try {
        await command(room.id, 'answer', { question_run_id: room.question_run_id, option_id: v.choice, text: v.text, revision: ++revision.current, suggestion: v.suggestion }, finalAction.current);
        await refresh();
    }
    catch (e) {
        sent.current = false;
        setNote(errorMessage(e));
        await refresh();
    } finally { setSending(false); } }, [room.id, room.question_run_id, room.available_actions, room.question?.argument_required, refresh, setNote]);
    useEffect(() => { if (!choice || !allowed)
        return; const v = ++revision.current; const timer = setTimeout(() => void command(room.id, 'draft', { question_run_id: room.question_run_id, option_id: choice, text, revision: v, suggestion }).catch(e => setNote(errorMessage(e))), 350); return () => clearTimeout(timer); }, [choice, text, allowed, room.id, room.question_run_id, setNote]);
    useEffect(() => { if (!allowed || !room.deadline_at) return; const flush = () => void submit(); window.addEventListener('sc-final-sync', flush); const timer = setTimeout(flush, Math.max(0, room.deadline_at * 1000 - (Date.now() + offset.current))); return () => { window.removeEventListener('sc-final-sync', flush); clearTimeout(timer); }; }, [allowed, room.deadline_at, submit, offset]);
    if (!allowed)
        return <section className="sc-dialog"><small>作答已保存</small><h2>你的觀點，已經有了位置。</h2><p>等待大家完成作答，接著一起看看各種立場。</p></section>;
    return <section className="sc-answer"><article className="sc-prompt"><small>情境 {room.question_index + 1} / {room.question_count}</small><h1>{room.question?.title}</h1><p>{room.question?.scenario}</p></article>
    {!writing ? <div className="sc-options">{room.question?.options.map((o, i) => <button key={o.id} className={'sc-option ' + (choice === o.id ? 'chosen' : '')} onClick={() => { setChoice(o.id); setWriting(true); }}><small>{String.fromCharCode(65 + i)}</small>{o.text}</button>)}</div> :
            <div className="sc-dialog sc-expand"><div className="selected-rail">{room.question?.options.map((o, i) => <button type="button" className={o.id === choice ? "selected" : "dimmed"} key={o.id} onClick={() => setChoice(o.id)}><small>{String.fromCharCode(65 + i)}</small>{o.text}</button>)}</div><button className="quiet" onClick={() => setWriting(false)}>← 返回選項，保留草稿</button><small>你的選擇 · {room.question?.options.find(o => o.id === choice)?.text}</small><DraftComposer value={text} onChange={value => { setText(value); if (suggestion?.suggestion_accepted) setSuggestion(current => ({ ...current, suggestion_edited: value !== ghost })); }} onSend={submit} enabled={allowed && !sending} canSend={Boolean(choice) && (!room.question?.argument_required || Boolean(text.trim()))} label="說說你選擇的理由" placeholder="我這樣想，是因為…" autoFocus ghostText={choice === '__other__' ? ghost : ''} onGhostAccepted={() => setSuggestion(current => ({ ...current, suggestion_accepted: true, suggestion_accepted_at: Date.now() / 1000, suggestion_edited: false }))}/></div>}
  </section>;
}
function SummaryText({ value }) {
    const [shown, setShown] = useState('');
    useEffect(() => {
        const chars = Array.from(value?.text || '');
        let count = 0;
        setShown('');
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setShown(chars.join(''));
            return;
        }
        const timer = window.setInterval(() => { count = Math.min(chars.length, count + 3); setShown(chars.slice(0, count).join('')); if (count === chars.length)
            clearInterval(timer); }, 25);
        return () => clearInterval(timer);
    }, [value?.text]);
    return value?.status === 'READY' ? <><p className="sc-reveal">{shown}</p>{value.key_points?.map((x, i) => <p key={i} className="sc-keypoint">{x}</p>)}</> : <div className="sc-pending"><span className="sc-pulse"/>稍後再產生，額度恢復後會更新。</div>;
}
function SummaryPanel({ room, refresh }) {
    const [open, setOpen] = useState(null);
    const summaries = room.summaries;
    const stats = summaries.statistics || [];
    const personal = room.member_id ? summaries.personal[room.member_id] : undefined;
    useEffect(() => { if (room.member_id && personal?.status === 'NOT_REQUESTED')
        void command(room.id, 'personal_summary').then(refresh); }, [room.id, room.member_id, personal?.status, refresh]);
    useEffect(() => { if (open === null)
        return; const prior = document.body.style.overflow; document.body.style.overflow = 'hidden'; const onKey = (e) => { if (e.key === 'Escape')
        setOpen(null); }; window.addEventListener('keydown', onKey); return () => { document.body.style.overflow = prior; window.removeEventListener('keydown', onKey); }; }, [open]);
    useEffect(() => { if (open !== null && room.member_id && !summaries.personal[room.member_id + ':' + open])
        void command(room.id, 'personal_summary', { question_index: open }).then(refresh); }, [open, room.id, room.member_id, summaries.personal, refresh]);
    const card = (s) => <><small>QUESTION {s.index + 1}</small><h2>{s.title}</h2><div className="sc-bars">{s.distribution.map((d, i) => <div key={i}><div className="sc-row"><span>{d.text}</span><b>{d.count} 人 · {d.percent.toFixed(1)}%</b></div><div className="sc-bar"><i style={{ width: d.percent + '%' }}/></div></div>)}</div><h3>全班的思考</h3><SummaryText value={summaries.questions[String(s.index)]}/><h3>我的思考</h3><SummaryText value={room.member_id ? summaries.personal[room.member_id + ':' + s.index] : undefined}/></>;
    return <section className="sc-summary"><small>THE MIRROR · 課堂回顧</small><h1>照見你帶來的原則。</h1><div className="sc-card"><h2>全課總結</h2><SummaryText value={summaries.class}/></div><div className="sc-script-grid">{stats.map(s => <article className="sc-card" key={s.index}><button className="sc-summary-card" onClick={() => setOpen(s.index)}><small>情境 {s.index + 1}</small><h2>{s.title}</h2><span>展開深度回顧 ↗</span></button></article>)}</div>
    {room.role === 'teacher' && <details className="sc-card" open><summary>教師完整分析與紀錄</summary><TeacherRecords records={summaries.records || []} statistics={stats} members={room.members}/></details>}
    {open !== null && <div className="sc-zen-backdrop" onClick={() => setOpen(null)}><article role="dialog" aria-modal="true" aria-label="單題深度回顧" className="sc-zen" onClick={e => e.stopPropagation()}><button autoFocus className="sc-zen-close" onClick={() => setOpen(null)}>關閉 ×</button>{stats.find(s => s.index === open) && card(stats.find(s => s.index === open))}</article></div>}
  </section>;
}
export function Classroom({ user, id }) { return <GroupClassroomGate user={user} id={id} Legacy={LegacyClassroom}/>; }
function LegacyClassroom({ id }) {
    const mode = new URLSearchParams(location.search).get('mode') || 'student';
    const { room, note, setNote, refresh, buffer, barrage, offset } = useRoom(id, mode);
    const [left, setLeft] = useState(false), [right, setRight] = useState(false), [menu, setMenu] = useState(false), [text, setText] = useState('');
    const [alias, setAlias] = useState('');
    const f = room?.focus;
    const selected = !!room?.member_id && f?.member_id === room.member_id && mode === 'student';
    const run = (kind, data = {}) => command(id, kind, data).then(async () => { await refresh(); return true; }).catch(e => { setNote(errorMessage(e)); return false; });
    if (!room)
        return <main className="sc-loading"><div className="sc-pulse"/><h2>正在進入教室</h2><p>{note}</p><a href="/">首頁</a></main>;
    return <main className="sc-classroom"><header className="sc-top"><button className="quiet" aria-label="展開教室側欄" onClick={() => setLeft(!left)}>☷</button><a className="sc-wordmark" href="/">Socrates</a><span>{room.title}</span><Clock deadline={room.deadline_at} offset={offset}/><button className="sc-hamburger" aria-label="三槓選單" onClick={() => setMenu(!menu)}>☰</button>{menu && <nav className="sc-menu"><button onClick={() => { setLeft(!left); setMenu(false); }}>教室成員</button><button onClick={() => { setRight(!right); setMenu(false); }}>完整對話</button><a href="/">回首頁</a>{room.role === 'teacher' && room.code && <button onClick={() => { location.href = `/classrooms/${id}?mode=student`; }}>以學生視角加入</button>}</nav>}</header>
    {left && <aside className="sc-drawer left"><button className="quiet" onClick={() => setLeft(false)}>收合 ←</button><h2>同一個教室</h2><p>{room.members.length} 位學生</p>{room.members.map(m => <div className="sc-member" key={m.id}><span className="sc-seat-avatar">{m.alias.slice(0, 1)}</span><span>{m.alias}{m.username && <span title={m.username} tabIndex={0} aria-label="教師身分對照"> ⓘ</span>}<small>{m.points} 點 · {m.online ? '在線' : '離席'}</small></span></div>)}</aside>}
    {right && <aside className="sc-drawer right"><button className="quiet" onClick={() => setRight(false)}>收合 →</button><h2>本題對話</h2>{room.transcript.map(x => <div key={x.id}>{x.messages.map((m, i) => <article className={'sc-message ' + m.role} key={i}><small>{m.role === 'tutor' ? '導師' : '同學'}</small><p>{m.text}</p></article>)}</div>)}</aside>}
    {room.phase === 'lobby' && <section className="sc-lobby"><small>{room.role === 'teacher' ? '課堂準備' : '已加入課堂'}</small><h1>{room.title}</h1><div className="sc-code-display">{room.code}</div><p>分享課程代碼，邀請同學入座。</p><div className="sc-seat-grid">{room.members.map(m => <div key={m.id}><span className="sc-seat-avatar">{m.alias.slice(0, 1)}</span>{m.alias}</div>)}</div>{room.role === 'teacher' ? <button disabled={!room.available_actions.includes('start')} onClick={() => void run('start')}>開始課堂 →</button> : room.member_id ? <p>已入座，等待老師開始。</p> : <div className="sc-row"><input value={alias} maxLength={JOIN_ALIAS_MAX_LENGTH} onChange={e => setAlias(e.target.value)} aria-label="匿名名稱"/><button onClick={() => void api('/classrooms/join', 'POST', { code: room.code, alias, avatar: 'scholar' }).then(refresh).catch(e => setNote(errorMessage(e)))}>以學生身份入座</button></div>}</section>}
    {room.phase === 'countdown' && <section className="sc-countdown"><small>讓我們開始思考</small><Clock deadline={room.deadline_at} offset={offset}/></section>}
    {room.phase === 'answering' && (room.role === 'teacher' ? <section className="sc-lobby"><small>QUESTION {room.question_index + 1}</small><h1>{room.question?.title}</h1><p>{room.question?.scenario}</p><p>學員正在作答，倒數由伺服器同步。</p></section> : <AnswerWithResearch sessionId={room.id}><AnswerPanel key={room.question_run_id} room={room} refresh={refresh} setNote={setNote} offset={offset}/></AnswerWithResearch>)}
    {room.phase === 'distribution' && <section className="sc-distribution"><small>OUR PERSPECTIVES</small><h1>同一個問題，不同的看法。</h1>{room.distribution.map((raw, i) => { const d = raw; return <article className="sc-card" key={i}><h2>{d.text}</h2><b>{d.percent.toFixed(1)}% · {d.count} 人</b><div className="sc-bar"><i style={{ width: d.percent + '%' }}/></div><div className="sc-row">{d.members?.map((m, j) => <span className="sc-mini-person" key={j}><i>{m.alias.slice(0, 1)}</i>{m.alias}</span>)}</div></article>; })}</section>}
    {['arena', 'focus', 'focus_summary'].includes(room.phase) && <><Arena room={room}/><div className="sc-barrage-layer">{barrage.map((b, i) => <span key={b.id} style={{ top: (12 + (i % 6) * 10) + '%' }}>{b.text}</span>)}</div>
      {selected && <aside className="sc-focus-chat"><small>你的深入討論</small>{f?.messages.map((m, i) => <article className={'sc-message ' + m.role} key={i}><small>{m.role === 'tutor' ? '導師' : '你'}</small><p>{m.text}</p></article>)}</aside>}
      <section className="sc-live-dialog"><small>{room.source_mode === 'openrouter' ? 'LIVE TUTOR' : 'SCRIPTED PROBE'} · {selected ? '導師正與你對話' : '一起聽聽這個觀點'}</small><FocusNotice status={f?.status} message={room.last_error}/><p>{buffer || f?.messages.filter(m => m.role === 'tutor').at(-1)?.text || (f?.status === 'TUTOR_UNAVAILABLE' ? '' : '導師正在整理問題…')}</p>{room.phase === 'focus_summary' && <p>{f?.micro_summary}</p>}
        {room.role === 'student' && <><DraftComposer value={text} onChange={setText} maxLength={selected ? 12000 : 500} label={selected ? '回覆導師' : '匿名彈幕'} enabled={!selected || room.available_actions.includes('focus_message')} placeholder={selected ? '說說你現在的想法…' : '分享一則匿名彈幕…'} onSend={async () => { if (text.trim()) {
            const ok = await run(selected ? 'focus_message' : 'barrage', { text });
            if (ok)
                setText('');
        } }}/><div className="sc-row">{f && !selected && room.available_actions.includes('reaction') && ['heart', 'like', 'gift'].map((kind, i) => <button className="sc-reaction" key={kind} aria-label={kind} onClick={() => void api(`/classrooms/${id}/reactions`, 'POST', { action_id: crypto.randomUUID(), kind, focus_id: f.id, turn_index: f.turn_index }).catch(e => setNote(errorMessage(e)))}>{['♡', '讚', '◇'][i]}</button>)}</div></>}
      </section></>}
    {room.phase === 'question_summary' && <section className="sc-lobby"><div className="sc-pulse"/><h1>正在醞釀下一個問題。</h1><p>本題討論已保存。模型可用時，課堂會自動接續。</p></section>}
    {room.phase === 'preview' && <section className="sc-lobby"><small>NEXT QUESTION</small><h1>{room.preview?.title || '下一個思考，即將展開。'}</h1><p>{room.preview?.scenario}</p>{room.role === 'teacher' && <div className="sc-row"><button onClick={() => void run('approve_question')}>採用題目</button><button className="quiet" onClick={() => void run('regenerate_question')}>重新生成</button></div>}</section>}
    {room.phase === 'summary' && <SummaryPanel room={room} refresh={refresh}/>}
    {room.available_actions.includes('next') && <button className="sc-teacher-next" onClick={() => void run('next')}>教師：下一步 →</button>}
    {note && <div role="status" className="sc-toast" onClick={() => setNote('')}>{note}</div>}
  </main>;
}
