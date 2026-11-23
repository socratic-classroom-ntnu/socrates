import { useCallback, useEffect, useState } from 'react';
import { api } from '../../contract/classroomClient';
import { errorMessage } from '../../contract/errorText';
import { ProviderSettings } from '../ai-settings/ProviderSettings';
import { VerificationGate } from '../auth/VerificationGate';
import { JoinDoor } from '../entrance/JoinDoor';
import { useInsideAppShell } from '../../shared/shellContext';
import { useFeatures } from '../../shared/publicConfig';

export function Home({ user }) {
  // 包在側欄外框裡時，帳號與導覽由外框提供，AI 連線設定不再畫自己的頂端列
  const insideShell = useInsideAppShell();
  const [mode, setMode] = useState(new URLSearchParams(location.search).get('view') === 'providers' ? 'providers' : 'student');
  const [rooms, setRooms] = useState([]), [note, setNote] = useState('');
  const refresh = useCallback(async () => {
    try { setRooms(await api('/classrooms')); setNote(''); }
    catch (error) { setNote(errorMessage(error)); }
  }, []);
  // 多人模式關閉時，放行的 AI 連線設定頁（?view=providers）不讀教室清單（後台 spec P28）
  const { features } = useFeatures();
  const groupMode = features.group_mode;
  useEffect(() => { if (user.verified && groupMode) void refresh(); }, [refresh, user.verified, groupMode]);
  if (!user.verified) return <VerificationGate user={user} onVerified={() => location.reload()}/>;
  if (mode === 'providers') return <main className="sc-home">{!insideShell && <header className="sc-top"><a href="/" className="sc-wordmark">Socrates<span>共思教室</span></a><span>{user.username}</span><button className="quiet" onClick={() => setMode('student')}>加入與近期課堂</button></header>}<ProviderSettings/></main>;
  return <JoinDoor user={user} rooms={rooms} note={note} onMode={next => {
    if (next === 'teacher') location.href = '/teacher/home';
    else location.href = '/teach/ai-settings';
  }}/>;
}
