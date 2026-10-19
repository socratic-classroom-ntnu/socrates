import { useRef, useState } from 'react';
import { ApiError, api } from '../../contract/classroomClient';
import { errorMessage } from '../../contract/errorText';
import type { components } from '../../contract/classroomTypes';
import { JOIN_ALIAS_MAX_LENGTH } from '../../contract/limits';
import '../../styles/entrance.css';

type Account = components['schemas']['AccountView'];
type Room = components['schemas']['RoomView'];
type RecentRoom = components['schemas']['RoomSummary'];
type JoinDoorProps = { user: Account; rooms: RecentRoom[]; note: string; onMode: (mode: 'teacher' | 'providers') => void };

export function joinErrorText(error: unknown): string {
  if (error instanceof ApiError && ['COURSE_CODE_REQUIRED', 'COURSE_CODE_NOT_FOUND'].includes(String(error.detail)))
    return '找不到這個課程代碼，請確認後再輸入。';
  return errorMessage(error);
}
const enter = (id: string, role: 'student' | 'teacher') => { location.href = `/classrooms/${id}?mode=${role}`; };
export const recentRoomRole = (room: Pick<RecentRoom, 'teacher'>): 'student' | 'teacher' => room.teacher ? 'teacher' : 'student';

export function JoinDoor({ user, rooms, note: pageNote, onMode }: JoinDoorProps) {
  const [code, setCode] = useState(''), [alias, setAlias] = useState('');
  const [joinError, setJoinError] = useState(''), [busy, setBusy] = useState(false);
  const joining = useRef(false);
  async function join() {
    if (joining.current) return;
    const clean = code.replace(/\s/g, '').toUpperCase();
    if (!clean) { setJoinError('請輸入課程代碼。'); return; }
    if (!/^[A-Z0-9]{8}$/.test(clean)) { setJoinError('請輸入老師提供的 8 碼課程代碼。'); return; }
    joining.current = true; setBusy(true); setJoinError('');
    try {
      const room: Room = await api('/classrooms/join', 'POST', {
        code: clean,
        alias: alias.trim() || ('~pending-' + crypto.randomUUID().slice(0, 8)),
        avatar: 'scholar',
      });
      enter(room.id, 'student');
    } catch (error) {
      setJoinError(joinErrorText(error));
    } finally {
      joining.current = false; setBusy(false);
    }
  }
  const shown = joinError || pageNote;
  return <main className="entrance">
    <div className="entrance-brand"><i>問</i>蘇格拉底課堂</div>
    <nav className="entrance-account" aria-label="帳號與其他入口">
      <span>{user.username} · {user.points ?? 0} 點</span>
      <button type="button" onClick={() => onMode('teacher')}>教師工作室</button>
      <button type="button" onClick={() => { setJoinError(''); onMode('providers'); }}>AI 連線設定</button>
      <button type="button" onClick={() => void api('/auth/logout', 'POST').then(() => location.reload())}>登出</button>
    </nav>
    <div className="entrance-leaf" aria-hidden="true"><span className="glass"/><span className="panel upper"/><span className="panel lower"/><span className="handle"/></div>
    <div className="entrance-stage"><form className="entrance-sign" aria-label="加入課堂" onSubmit={event => { event.preventDefault(); void join(); }}>
      <span className="screw tl"/><span className="screw tr"/><span className="screw bl"/><span className="screw br"/>
      <header className="entrance-plate"><h1>［課堂入口］</h1><small>輸入老師給的代碼</small></header>
      <dl className="entrance-meta"><dt>主持</dt><dd>蘇格拉底</dd></dl>
      <label>課程代碼<input className="entrance-code" required autoComplete="off" spellCheck={false} placeholder="8 碼代碼" maxLength={12} aria-invalid={joinError ? true : undefined} value={code} onChange={event => { setCode(event.target.value.toUpperCase().replace(/\s/g, '')); setJoinError(''); }}/></label>
      <label>本次匿名名稱（選填）<input maxLength={JOIN_ALIAS_MAX_LENGTH} autoComplete="nickname" value={alias} onChange={event => setAlias(event.target.value)}/></label>
      {shown && <p role={joinError ? 'alert' : 'status'} className="entrance-note error">{shown}</p>}
      <button className="entrance-primary" disabled={busy || !code.trim()}>{busy ? '正在加入…' : '加入課堂 →'}</button>
      {rooms.length > 0 && <details className="entrance-recent"><summary>近期教室（{rooms.length}）</summary><ul>{rooms.map(room => <li key={room.id}><button type="button" onClick={() => enter(room.id, recentRoomRole(room))}><strong>{room.title}</strong><span>{room.phase}</span></button></li>)}</ul></details>}
      <nav className="entrance-links" aria-label="其他模式"><a href="/round1">單人練習</a></nav>
    </form></div>
  </main>;
}
