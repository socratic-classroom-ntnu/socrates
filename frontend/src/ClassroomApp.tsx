import { useEffect, useState } from 'react';
import { api, setCSRF } from './api/classroomClient';
import { publishDevAccount } from './features/dev-console/devConsoleStore';
import { Auth } from './features/auth/AuthForm';
import { VerificationGate } from './features/auth/VerificationGate';
import { Classroom } from './features/student-classroom/Classroom';
import { Home } from './features/student-classroom/StudentHome';
import { ClassroomLibrary } from './features/authoring/ClassroomLibrary';
import { TeacherDashboard, TeacherShell } from './features/authoring/TeacherDashboard';
import { pathAfterLogin, teacherRoute } from './teacherRoute';
import './styles/style.css';
import './styles/design-library.css';
// 共思教室的進入點：只做登入狀態與路由，各畫面在自己的前端模組（docs/modules/README.md）。
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
