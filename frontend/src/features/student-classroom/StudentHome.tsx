import { useCallback, useEffect, useState } from 'react';
import { api } from '../../contract/classroomClient';
import { errorMessage } from '../../contract/errorText';
import { ProviderSettings } from '../ai-settings/ProviderSettings';
import { VerificationGate } from '../auth/VerificationGate';
import { JoinDoor } from '../entrance/JoinDoor';

export function Home({ user }) {
  const [mode, setMode] = useState(new URLSearchParams(location.search).get('view') === 'providers' ? 'providers' : 'student');
  const [rooms, setRooms] = useState([]), [note, setNote] = useState('');
  const refresh = useCallback(async () => {
    try { setRooms(await api('/classrooms')); setNote(''); }
    catch (error) { setNote(errorMessage(error)); }
  }, []);
  useEffect(() => { if (user.verified) void refresh(); }, [refresh, user.verified]);
  if (!user.verified) return <VerificationGate user={user} onVerified={() => location.reload()}/>;
  if (mode === 'providers') return <main className="sc-home"><header className="sc-top"><a href="/" className="sc-wordmark">Socrates<span>共思教室</span></a><span>{user.username}</span><button className="quiet" onClick={() => setMode('student')}>加入與近期課堂</button></header><ProviderSettings/></main>;
  return <JoinDoor user={user} rooms={rooms} note={note} onMode={next => {
    if (next === 'teacher') location.href = '/teacher/home';
    else setMode('providers');
  }}/>;
}
