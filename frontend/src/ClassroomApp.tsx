import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, command, setCSRF } from './api/classroomClient';
import { PASSWORD_RULE, fieldErrors, fieldText } from './api/errorText';
import { Arena } from './features/classroom-stage/Arena';
import { DraftComposer } from './shared/input/DraftComposer';
import { phaseLabel } from './shared/phaseLabels';
import { publishDevAccount, useDevView } from './features/dev-console/devConsoleStore';
import './styles/style.css';
import { ClassroomLibrary } from './pages/ClassroomLibrary';
import { AnswerWithResearch } from './features/research/ResearchSidebar';
import './styles/design-library.css';
import { GroupClassroomGate } from './pages/GroupClassroom';
import { ProviderSettings } from './pages/ProviderSettings';
import { VerificationGate } from './pages/VerificationGate';
import { FocusNotice } from './components/FocusNotice';
import { TeacherRecords } from './features/teacher-records/TeacherRecords';
import { TeacherDashboard, TeacherShell } from './pages/TeacherDashboard';
import { pathAfterLogin, teacherRoute } from './teacherRoute';
const errorText = (e) => e instanceof Error ? e.message : String(e);
// 與後端 JoinRoom.alias 的 max_length 一致（backend/app/api/classroom_schemas.py）；超過會被後端 422 擋下。
export const JOIN_ALIAS_MAX_LENGTH = 40;
// 與後端 Register 一致（backend/app/api/classroom_schemas.py）：送出前先在前端擋下，錯誤說明對應到欄位。
export const REGISTER_LIMITS = { username: [3, 32], email: [3, 254], password: [8, 32] } as const;
// 與後端 USERNAME_PATTERN 一致：英文字母開頭、英文字母或數字結尾，中間可用英數、底線、點、連字號。
const USERNAME_RE = /^[A-Za-z][A-Za-z0-9_.-]*[A-Za-z0-9]$/;
// 後端只要求 @ 後面有點；這裡同樣要求網域有點（123@g 會被擋下），也不允許空白。
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 與後端 PASSWORD_SPECIALS 一致；密碼需大寫、小寫、數字與其中一個特殊字元，不能有其他符號。
// 登入不檢查格式：舊規則（12–256 字）設定的密碼要能照常輸入。
const LOGIN_PASSWORD_MAX = 256;
export const PASSWORD_SPECIALS = '!@#$%^&*_-+=.?~';
/** 設定新密碼時只讓允許的字元進輸入框；回傳留下的字與被擋下的字（去重、以空白分隔）。 */
export function keepPasswordChars(value: string) {
    const ok = (c: string) => /[A-Za-z0-9]/.test(c) || PASSWORD_SPECIALS.includes(c);
    const list = Array.from(value);
    const kept = list.filter(ok).slice(0, REGISTER_LIMITS.password[1]).join('');
    const blocked = [...new Set(list.filter(c => !ok(c)).map(c => (c === ' ' ? '空白' : c)))].join(' ');
    return { kept, blocked };
}
export function passwordOk(value: string) {
    const special = (c: string) => PASSWORD_SPECIALS.includes(c);
    const list = Array.from(value);
    return list.every(c => /[A-Za-z0-9]/.test(c) || special(c))
        && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value) && list.some(special);
}
const chars = (value: string) => Array.from(value).length;
/** 註冊欄位的前端預檢；訊息與後端 422 轉成的中文相同。 */
export function registerProblems({ username, email, password }: { username: string; email: string; password: string }) {
    const problems: { field: string; text: string }[] = [];
    const length = (field: 'username' | 'email' | 'password', value: string) => {
        const [min, max] = REGISTER_LIMITS[field];
        if (!value) return fieldText(field, 'missing');
        if (chars(value) < min) return fieldText(field, 'string_too_short', { min_length: min });
        if (chars(value) > max) return fieldText(field, 'string_too_long', { max_length: max });
        return '';
    };
    const user = length('username', username) || (USERNAME_RE.test(username) ? '' : fieldText('username', 'string_pattern_mismatch'));
    if (user) problems.push({ field: 'username', text: user });
    const mail = length('email', email) || (EMAIL_RE.test(email) ? '' : fieldText('email', 'value_error'));
    if (mail) problems.push({ field: 'email', text: mail });
    const secret = length('password', password) || (passwordOk(password) ? '' : fieldText('password', 'password_policy'));
    if (secret) problems.push({ field: 'password', text: secret });
    return problems;
}
// 註冊時已被使用的欄位：錯誤顯示在該欄位下方。ACCOUNT_PENDING_VERIFICATION 可能是任一欄位，顯示在表單說明。
const TAKEN_FIELD: Record<string, string> = { USERNAME_TAKEN: 'username', EMAIL_TAKEN: 'email' };
function Auth({ onLogin }) {
    const [mode, setMode] = useState('login');
    const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState('');
    const [blocked, setBlocked] = useState('');
    const [note, setNote] = useState(''), [busy, setBusy] = useState(false);
    const [fieldError, setFieldError] = useState<Record<string, string>>({});
    const usernameInput = useRef<HTMLInputElement>(null), emailInput = useRef<HTMLInputElement>(null), passwordInput = useRef<HTMLInputElement>(null);
    const inputs = { username: usernameInput, email: emailInput, password: passwordInput };
    const showFieldErrors = (list: { field: string; text: string }[]) => {
        setFieldError(Object.fromEntries(list.map(f => [f.field, f.text])));
        setNote('');
        inputs[list[0].field]?.current?.focus();
    };
    const clearField = (field: string) => setFieldError(current => {
        if (!current[field]) return current;
        const next = { ...current };
        delete next[field];
        return next;
    });
    const switchMode = next => { setMode(next); setFieldError({}); setBlocked(''); };
    const fieldProps = (field: string, hint?: string) => mode === 'register' && fieldError[field]
        ? { 'aria-invalid': true, 'aria-describedby': [hint, `register-${field}-error`].filter(Boolean).join(' ') }
        : hint ? { 'aria-describedby': hint } : {};
    const fieldMessage = (field: string) => mode === 'register' && fieldError[field]
        ? <small id={`register-${field}-error`} role="alert">{fieldError[field]}</small>
        : null;
    const query = new URLSearchParams(location.search);
    useEffect(() => {
        const token = new URLSearchParams(location.search).get('verify_token');
        if (token)
            void api('/auth/verify', 'POST', { token }).then(() => { setNote('Email 已驗證，請登入。'); history.replaceState({}, '', '/'); }).catch(e => setNote(errorText(e)));
        if (new URLSearchParams(location.search).has('reset_token'))
            setMode('reset');
    }, []);
    async function submit() {
        setBusy(true);
        try {
            if (mode === 'login') {
                const a = await api('/auth/login', 'POST', { login: name, password });
                setCSRF(a.csrf_token);
                onLogin(a);
            }
            if (mode === 'register') {
                const problems = registerProblems({ username: name, email: email.trim(), password });
                if (problems.length) {
                    showFieldErrors(problems);
                    return;
                }
                setFieldError({});
                const account = await api('/auth/register', 'POST', {
                    username: name,
                    email: email.trim(),
                    password
                });
                setCSRF(account.csrf_token);
                onLogin(account);
            }
            if (mode === 'forgot') {
                await api('/auth/forgot-password', 'POST', { email });
                setNote('重設郵件已排入寄送；請查看信箱。');
            }
            if (mode === 'reset') {
                if (!passwordOk(password) || Array.from(password).length < REGISTER_LIMITS.password[0] || Array.from(password).length > REGISTER_LIMITS.password[1]) {
                    setNote(PASSWORD_RULE);
                    return;
                }
                await api('/auth/reset-password', 'POST', { token: query.get('reset_token'), password });
                history.replaceState({}, '', '/');
                setMode('login');
                setNote('密碼已更新，請重新登入。');
            }
        }
        catch (e) {
            const fields = mode !== 'register' || !(e instanceof ApiError) ? []
                : e.status === 422 ? fieldErrors(e.detail)
                    : TAKEN_FIELD[String(e.detail)] ? [{ field: TAKEN_FIELD[String(e.detail)], text: e.message }] : [];
            if (fields.length)
                showFieldErrors(fields);
            else
                setNote(errorText(e));
        }
        finally {
            setBusy(false);
        }
    }
    return <main className="sc-auth"><div className="sc-brand">S</div><small>SOCRATES · 共思教室</small><h1>從一個問題，<br />看見自己的原則。</h1><p className="muted">表達、追問、相遇。每個觀點都有自己的位置。</p>
    <form noValidate={mode === 'register'} onSubmit={e => { e.preventDefault(); void submit(); }} className="sc-glass">
      <h2>{{ login: '歡迎回來', register: '建立帳號', forgot: '重設登入密碼', reset: '設定新密碼' }[mode]}</h2>
      {(mode === 'login' || mode === 'register') && <><label>{mode === 'login' ? '使用者名稱或 Email' : '使用者名稱'}<input ref={usernameInput} autoComplete="username" required maxLength={mode === 'login' ? REGISTER_LIMITS.email[1] : REGISTER_LIMITS.username[1]} value={name} {...fieldProps('username')} onChange={e => { setName(e.target.value); clearField('username'); }}/></label>{fieldMessage('username')}</>}
      {(mode === 'register' || mode === 'forgot') && <><label>Email<input ref={emailInput} type="email" required maxLength={REGISTER_LIMITS.email[1]} value={email} {...fieldProps('email')} onChange={e => { setEmail(e.target.value); clearField('email'); }}/></label>{fieldMessage('email')}</>}
      {mode !== 'forgot' && <><label>密碼<input ref={passwordInput} type="password" maxLength={mode === 'login' ? LOGIN_PASSWORD_MAX : REGISTER_LIMITS.password[1]} minLength={mode === 'login' ? 1 : REGISTER_LIMITS.password[0]} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required value={password} {...fieldProps('password', mode === 'login' ? undefined : 'password-rule')} onChange={e => { const next = mode === 'login' ? { kept: e.target.value, blocked: '' } : keepPasswordChars(e.target.value); setPassword(next.kept); setBlocked(next.blocked); clearField('password'); }}/></label>{mode !== 'login' && <small id="password-rule" className="muted">{PASSWORD_RULE}</small>}{mode !== 'login' && blocked && <small className="password-blocked" role="status">已擋下不允許的字元：{blocked}</small>}{fieldMessage('password')}</>}
      <button disabled={busy}>{busy ? '處理中…' : '繼續'}</button><p role="status">{note}</p>
      <div className="sc-row"><button type="button" className="quiet" onClick={() => switchMode(mode === 'register' ? 'login' : 'register')}>{mode === 'register' ? '回到登入' : '註冊'}</button><button type="button" className="quiet" onClick={() => switchMode('forgot')}>重設密碼</button></div>
    </form></main>;
}
export function Home({ user }) {
    const [mode, setMode] = useState(new URLSearchParams(location.search).get('view') === 'providers' ? 'providers' : 'student');
    const [rooms, setRooms] = useState([]), [loading, setLoading] = useState(true);
    const [code, setCode] = useState(''), [alias, setAlias] = useState('');
    const [note, setNote] = useState(''), [busy, setBusy] = useState(false);
    // 加入課堂的錯誤只屬於加入卡片：改代碼或切換分頁就清掉，不會殘留到其他分頁。
    const [joinError, setJoinError] = useState('');
    const joining = useRef(false);
    const switchMode = next => { setMode(next); setJoinError(''); };
    const refresh = useCallback(async () => {
        setLoading(true);
        try { setRooms(await api('/classrooms')); setNote(''); }
        catch (e) { setNote(errorText(e)); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { if (user.verified) void refresh(); }, [refresh,user.verified]);
    if (!user.verified) return <VerificationGate user={user} onVerified={() => location.reload()}/>;
    const enter = (id, role) => { location.href = `/classrooms/${id}?mode=${role}`; };
    async function join() {
        if (joining.current) return;
        const clean = code.replace(/\s/g,'').toUpperCase();
        if (!clean) { setJoinError('請輸入課程代碼。'); return; }
        if (!/^[A-Z0-9]{8}$/.test(clean)) { setJoinError('請輸入老師提供的 8 碼課程代碼。'); return; }
        joining.current = true; setBusy(true); setJoinError('');
        try { const r = await api('/classrooms/join','POST',{code:clean,alias:alias.trim() || ('~pending-' + crypto.randomUUID().slice(0,8)),avatar:'scholar'}); enter(r.id,'student'); }
        catch(e) { setJoinError(errorText(e)); }
        finally { joining.current=false; setBusy(false); }
    }
    return <main className="sc-home student-home">
      <header className="sc-top"><a href="/" className="sc-wordmark">Socrates<span>共思教室</span></a><span>{user.username}</span><a className="teacher-quiet" href="/teacher/home">切換到教師端</a><button className="quiet" onClick={() => void api('/auth/logout','POST').then(() => location.reload()).catch(e => setNote(errorText(e)))}>登出</button></header>
      <section className="sc-home-hero"><small>學生端</small><h1>{mode === 'student' ? '準備好，說說你的想法。' : 'AI 連線設定'}</h1><p>{mode === 'student' ? '輸入課程代碼加入討論，或繼續上次的課堂。' : '連接你的模型，並選擇適合課堂的設定。'}</p><nav className="sc-tabs" aria-label="學生導覽"><button aria-pressed={mode==='student'} onClick={() => switchMode('student')}>加入與近期課堂</button><button aria-pressed={mode==='providers'} onClick={() => switchMode('providers')}>AI 連線設定</button></nav></section>
      {note && <p role="status">{note}</p>}
      {mode === 'providers' ? <ProviderSettings/> : <>
        <div className="student-grid"><form className="sc-join sc-glass" onSubmit={e=>{e.preventDefault();void join()}} aria-label="加入課堂"><small>加入課堂</small><h2>找到你的座位</h2><label>課程代碼<input value={code} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={12} aria-describedby={joinError ? 'join-help join-error' : 'join-help'} aria-invalid={joinError ? true : undefined} placeholder="例如 AB12CD34" onChange={e=>{ setCode(e.target.value.toUpperCase().replace(/\s/g,'')); setJoinError(''); }}/></label><small id="join-help">請向老師取得 8 碼代碼。</small><label>本次匿名名稱（選填）<input value={alias} maxLength={JOIN_ALIAS_MAX_LENGTH} placeholder="課堂中想使用的稱呼" onChange={e=>setAlias(e.target.value)}/></label><small>留空時，入座後由老師確認課堂稱呼。</small><button disabled={busy || !code.trim()} aria-busy={busy}>{busy ? '正在加入…' : '加入課堂 →'}</button>{joinError && <p role="alert" id="join-error">{joinError}</p>}</form>
        <aside className="sc-card student-guide"><small>一堂課，三個步驟</small><h2>讓每個觀點都有位置</h2><ol><li><strong>加入課堂</strong><p>使用老師提供的課程代碼入座。</p></li><li><strong>選擇與說明</strong><p>讀完情境，選擇立場並寫下理由。</p></li><li><strong>討論與回顧</strong><p>聽聽其他想法，留下自己的思考。</p></li></ol><a href="/round1">先體驗一段單人對話 →</a></aside></div>
        <section aria-label="近期課堂"><div className="sc-section-title"><h2>近期課堂</h2><button className="quiet" disabled={loading} onClick={() => void refresh()}>{loading?'讀取中…':'重新整理'}</button></div>{!loading && !rooms.length && <div className="sc-card"><h3>加入第一堂課後，這裡會留下紀錄</h3><p>上方輸入課程代碼即可開始。</p></div>}<div className="sc-script-grid">{rooms.map(r=><a className="sc-card" key={r.id} href={`/classrooms/${r.id}?mode=${r.teacher?'teacher':'student'}`}><small>{r.teacher?'授課中':'我的課堂'} · {phaseLabel(r.phase)}</small><h3>{r.title}</h3><span>{r.phase === 'summary'?'查看課堂回顧':'繼續課堂'} →</span></a>)}</div></section>
      </>}
    </main>;
}
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
        setNote(errorText(e));
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
        setNote(errorText(e));
        await refresh();
    } finally { setSending(false); } }, [room.id, room.question_run_id, room.available_actions, room.question?.argument_required, refresh, setNote]);
    useEffect(() => { if (!choice || !allowed)
        return; const v = ++revision.current; const timer = setTimeout(() => void command(room.id, 'draft', { question_run_id: room.question_run_id, option_id: choice, text, revision: v, suggestion }).catch(e => setNote(errorText(e))), 350); return () => clearTimeout(timer); }, [choice, text, allowed, room.id, room.question_run_id, setNote]);
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
function Classroom({ user, id }) { return <GroupClassroomGate user={user} id={id} Legacy={LegacyClassroom}/>; }
function LegacyClassroom({ id }) {
    const mode = new URLSearchParams(location.search).get('mode') || 'student';
    const { room, note, setNote, refresh, buffer, barrage, offset } = useRoom(id, mode);
    const [left, setLeft] = useState(false), [right, setRight] = useState(false), [menu, setMenu] = useState(false), [text, setText] = useState('');
    const [alias, setAlias] = useState('');
    const f = room?.focus;
    const selected = !!room?.member_id && f?.member_id === room.member_id && mode === 'student';
    const run = (kind, data = {}) => command(id, kind, data).then(async () => { await refresh(); return true; }).catch(e => { setNote(errorText(e)); return false; });
    if (!room)
        return <main className="sc-loading"><div className="sc-pulse"/><h2>正在進入教室</h2><p>{note}</p><a href="/">首頁</a></main>;
    return <main className="sc-classroom"><header className="sc-top"><button className="quiet" aria-label="展開教室側欄" onClick={() => setLeft(!left)}>☷</button><a className="sc-wordmark" href="/">Socrates</a><span>{room.title}</span><Clock deadline={room.deadline_at} offset={offset}/><button className="sc-hamburger" aria-label="三槓選單" onClick={() => setMenu(!menu)}>☰</button>{menu && <nav className="sc-menu"><button onClick={() => { setLeft(!left); setMenu(false); }}>教室成員</button><button onClick={() => { setRight(!right); setMenu(false); }}>完整對話</button><a href="/">回首頁</a>{room.role === 'teacher' && room.code && <button onClick={() => { location.href = `/classrooms/${id}?mode=student`; }}>以學生視角加入</button>}</nav>}</header>
    {left && <aside className="sc-drawer left"><button className="quiet" onClick={() => setLeft(false)}>收合 ←</button><h2>同一個教室</h2><p>{room.members.length} 位學生</p>{room.members.map(m => <div className="sc-member" key={m.id}><span className="sc-seat-avatar">{m.alias.slice(0, 1)}</span><span>{m.alias}{m.username && <span title={m.username} tabIndex={0} aria-label="教師身分對照"> ⓘ</span>}<small>{m.points} 點 · {m.online ? '在線' : '離席'}</small></span></div>)}</aside>}
    {right && <aside className="sc-drawer right"><button className="quiet" onClick={() => setRight(false)}>收合 →</button><h2>本題對話</h2>{room.transcript.map(x => <div key={x.id}>{x.messages.map((m, i) => <article className={'sc-message ' + m.role} key={i}><small>{m.role === 'tutor' ? '導師' : '同學'}</small><p>{m.text}</p></article>)}</div>)}</aside>}
    {room.phase === 'lobby' && <section className="sc-lobby"><small>{room.role === 'teacher' ? '課堂準備' : '已加入課堂'}</small><h1>{room.title}</h1><div className="sc-code-display">{room.code}</div><p>分享課程代碼，邀請同學入座。</p><div className="sc-seat-grid">{room.members.map(m => <div key={m.id}><span className="sc-seat-avatar">{m.alias.slice(0, 1)}</span>{m.alias}</div>)}</div>{room.role === 'teacher' ? <button disabled={!room.available_actions.includes('start')} onClick={() => void run('start')}>開始課堂 →</button> : room.member_id ? <p>已入座，等待老師開始。</p> : <div className="sc-row"><input value={alias} maxLength={JOIN_ALIAS_MAX_LENGTH} onChange={e => setAlias(e.target.value)} aria-label="匿名名稱"/><button onClick={() => void api('/classrooms/join', 'POST', { code: room.code, alias, avatar: 'scholar' }).then(refresh).catch(e => setNote(errorText(e)))}>以學生身份入座</button></div>}</section>}
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
        } }}/><div className="sc-row">{f && !selected && room.available_actions.includes('reaction') && ['heart', 'like', 'gift'].map((kind, i) => <button className="sc-reaction" key={kind} aria-label={kind} onClick={() => void api(`/classrooms/${id}/reactions`, 'POST', { action_id: crypto.randomUUID(), kind, focus_id: f.id, turn_index: f.turn_index }).catch(e => setNote(errorText(e)))}>{['♡', '讚', '◇'][i]}</button>)}</div></>}
      </section></>}
    {room.phase === 'question_summary' && <section className="sc-lobby"><div className="sc-pulse"/><h1>正在醞釀下一個問題。</h1><p>本題討論已保存。模型可用時，課堂會自動接續。</p></section>}
    {room.phase === 'preview' && <section className="sc-lobby"><small>NEXT QUESTION</small><h1>{room.preview?.title || '下一個思考，即將展開。'}</h1><p>{room.preview?.scenario}</p>{room.role === 'teacher' && <div className="sc-row"><button onClick={() => void run('approve_question')}>採用題目</button><button className="quiet" onClick={() => void run('regenerate_question')}>重新生成</button></div>}</section>}
    {room.phase === 'summary' && <SummaryPanel room={room} refresh={refresh}/>}
    {room.available_actions.includes('next') && <button className="sc-teacher-next" onClick={() => void run('next')}>教師：下一步 →</button>}
    {note && <div role="status" className="sc-toast" onClick={() => setNote('')}>{note}</div>}
  </main>;
}
export default function ClassroomApp() {
    const [user, setUser] = useState(null), [ready, setReady] = useState(false);
    useEffect(() => { void api('/auth/me').then(a => { setCSRF(a.csrf_token); setUser(a); }).catch(() => undefined).finally(() => setReady(true)); }, []);
    useEffect(() => { publishDevAccount(user); }, [user]); // 開發控制台沿用這次 /auth/me，不另外查詢
    if (!ready)
        return <main className="sc-loading"><div className="sc-pulse"/></main>;
    if (!user || new URLSearchParams(location.search).has('reset_token') || new URLSearchParams(location.search).has('verify_token'))
        return <Auth onLogin={a => { setUser(a); history.replaceState({}, '', pathAfterLogin(location.pathname, location.search, location.hash)); }}/>;
    const room = location.pathname.match(/^\/classrooms\/([\w-]+)/);
    if (room)
        return <Classroom user={user} id={room[1]}/>;
    const teacher = teacherRoute(location.pathname, user.verified);
    if (teacher?.page === 'verify')
        return <VerificationGate user={user} onVerified={() => location.reload()}/>;
    if (teacher?.page === 'home')
        return <TeacherDashboard user={user}/>;
    if (teacher?.page === 'course')
        return <TeacherShell active="home"><ClassroomLibrary initialSelected={teacher.courseId}/></TeacherShell>;
    return <Home user={user}/>;
}
