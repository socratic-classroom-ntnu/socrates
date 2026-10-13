import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/classroomClient';
import { errorMessage } from '../../api/errorText';
import { phaseLabel } from '../../shared/phaseLabels';
import { ProviderSettings } from '../ai-settings/ProviderSettings';
import { VerificationGate } from '../auth/VerificationGate';
import { JOIN_ALIAS_MAX_LENGTH } from './limits';
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
        catch (e) { setNote(errorMessage(e)); }
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
        catch(e) { setJoinError(errorMessage(e)); }
        finally { joining.current=false; setBusy(false); }
    }
    return <main className="sc-home student-home">
      <header className="sc-top"><a href="/" className="sc-wordmark">Socrates<span>共思教室</span></a><span>{user.username}</span><a className="teacher-quiet" href="/teacher/home">切換到教師端</a><button className="quiet" onClick={() => void api('/auth/logout','POST').then(() => location.reload()).catch(e => setNote(errorMessage(e)))}>登出</button></header>
      <section className="sc-home-hero"><small>學生端</small><h1>{mode === 'student' ? '準備好，說說你的想法。' : 'AI 連線設定'}</h1><p>{mode === 'student' ? '輸入課程代碼加入討論，或繼續上次的課堂。' : '連接你的模型，並選擇適合課堂的設定。'}</p><nav className="sc-tabs" aria-label="學生導覽"><button aria-pressed={mode==='student'} onClick={() => switchMode('student')}>加入與近期課堂</button><button aria-pressed={mode==='providers'} onClick={() => switchMode('providers')}>AI 連線設定</button></nav></section>
      {note && <p role="status">{note}</p>}
      {mode === 'providers' ? <ProviderSettings/> : <>
        <div className="student-grid"><form className="sc-join sc-glass" onSubmit={e=>{e.preventDefault();void join()}} aria-label="加入課堂"><small>加入課堂</small><h2>找到你的座位</h2><label>課程代碼<input value={code} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={12} aria-describedby={joinError ? 'join-help join-error' : 'join-help'} aria-invalid={joinError ? true : undefined} placeholder="例如 AB12CD34" onChange={e=>{ setCode(e.target.value.toUpperCase().replace(/\s/g,'')); setJoinError(''); }}/></label><small id="join-help">請向老師取得 8 碼代碼。</small><label>本次匿名名稱（選填）<input value={alias} maxLength={JOIN_ALIAS_MAX_LENGTH} placeholder="課堂中想使用的稱呼" onChange={e=>setAlias(e.target.value)}/></label><small>留空時，入座後由老師確認課堂稱呼。</small><button disabled={busy || !code.trim()} aria-busy={busy}>{busy ? '正在加入…' : '加入課堂 →'}</button>{joinError && <p role="alert" id="join-error">{joinError}</p>}</form>
        <aside className="sc-card student-guide"><small>一堂課，三個步驟</small><h2>讓每個觀點都有位置</h2><ol><li><strong>加入課堂</strong><p>使用老師提供的課程代碼入座。</p></li><li><strong>選擇與說明</strong><p>讀完情境，選擇立場並寫下理由。</p></li><li><strong>討論與回顧</strong><p>聽聽其他想法，留下自己的思考。</p></li></ol><a href="/round1">先體驗一段單人對話 →</a></aside></div>
        <section aria-label="近期課堂"><div className="sc-section-title"><h2>近期課堂</h2><button className="quiet" disabled={loading} onClick={() => void refresh()}>{loading?'讀取中…':'重新整理'}</button></div>{!loading && !rooms.length && <div className="sc-card"><h3>加入第一堂課後，這裡會留下紀錄</h3><p>上方輸入課程代碼即可開始。</p></div>}<div className="sc-script-grid">{rooms.map(r=><a className="sc-card" key={r.id} href={`/classrooms/${r.id}?mode=${r.teacher?'teacher':'student'}`}><small>{r.teacher?'授課中':'我的課堂'} · {phaseLabel(r.phase)}</small><h3>{r.title}</h3><span>{r.phase === 'summary'?'查看課堂回顧':'繼續課堂'} →</span></a>)}</div></section>
      </>}
    </main>;
}
