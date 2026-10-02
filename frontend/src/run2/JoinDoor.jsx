import { useState } from 'react';
import { api } from './client';
import { authErrorText } from './Auth';
import './auth.css';

export function joinErrorText(e) {
    if (e?.detail === 'COURSE_CODE_REQUIRED')
        return '找不到這個課程代碼，請再確認一次。';
    return authErrorText(e);
}

const enter = (id, role) => { location.href = `/classrooms/${id}?mode=${role}`; };

// 學生入口：站在教室門口輸入課程代碼。門牌內容是固定裝飾——加入前後端查不到課程資訊。
export function JoinDoor({ user, rooms, note: pageNote, onMode }) {
    const [code, setCode] = useState(''), [alias, setAlias] = useState('');
    const [note, setNote] = useState(''), [busy, setBusy] = useState(false);
    async function join() {
        setBusy(true);
        try {
            const r = await api('/classrooms/join', 'POST', { code, alias: alias.trim() || ('~pending-' + crypto.randomUUID().slice(0, 8)), avatar: 'scholar' });
            enter(r.id, 'student');
        }
        catch (e) {
            setNote(joinErrorText(e));
            setBusy(false);
        }
    }
    const shown = note || pageNote;
    return <main className="r2-door">
      <div className="r2-door-brand"><i>問</i>蘇格拉底課堂</div>
      <nav className="r2-door-account" aria-label="帳號與其他入口">
        <span>{user.username} · {user.points} 點</span>
        <button type="button" onClick={() => onMode('teacher')}>教師工作室</button>
        <button type="button" onClick={() => onMode('providers')}>LLM 設定</button>
        <button type="button" onClick={() => void api('/auth/logout', 'POST').then(() => location.reload())}>登出</button>
      </nav>
      <div className="r2-door-leaf" aria-hidden="true"><span className="glass"/><span className="panel upper"/><span className="panel lower"/><span className="handle"/></div>
      <div className="r2-door-stage">
        <form className="r2-door-sign" onSubmit={e => { e.preventDefault(); void join(); }}>
          <span className="screw tl"/><span className="screw tr"/><span className="screw bl"/><span className="screw br"/>
          <header className="r2-door-plate"><h1>［課堂入口］</h1><small>輸入老師給的代碼</small></header>
          <dl className="r2-door-meta"><dt>主持</dt><dd>蘇格拉底</dd></dl>
          <label>課程代碼<input className="r2-door-code" required autoComplete="off" spellCheck={false} placeholder="8 碼代碼" value={code} onChange={e => setCode(e.target.value.toUpperCase())}/></label>
          <label>你的名字 <span className="hint">· 同學會看到這個名字</span><input maxLength={40} autoComplete="nickname" value={alias} onChange={e => setAlias(e.target.value)}/></label>
          <p role="status" className={'r2-door-note' + (shown ? ' error' : '')}>{shown}</p>
          <button className="r2-door-primary" disabled={busy}>{busy ? '推門中…' : '推門進入 →'}</button>
          {rooms.length > 0 && <details className="r2-door-recent"><summary>近期教室（{rooms.length}）</summary>
            <ul>{rooms.map(r => <li key={r.id}><button type="button" onClick={() => enter(r.id, 'student')}><strong>{r.title}</strong><span>{r.phase}</span></button></li>)}</ul>
          </details>}
          <nav className="r2-door-links" aria-label="其他模式"><a href="/round1">單人練習（Round 1）</a></nav>
        </form>
      </div>
    </main>;
}
