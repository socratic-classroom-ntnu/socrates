import { useEffect, useState } from 'react';
import { api, setCSRF } from './contract/classroomClient';
import { publishDevAccount } from './features/dev-console/devConsoleStore';
import { Auth } from './features/entrance/Auth';
import { RoleSelect } from './features/entrance/RoleSelect';
import { VerificationGate } from './features/auth/VerificationGate';
import { Classroom } from './features/student-classroom/Classroom';
import { Home } from './features/student-classroom/StudentHome';
import { ClassroomLibrary } from './features/authoring/ClassroomLibrary';
import { TeacherDashboard, TeacherShell } from './features/authoring/TeacherDashboard';
import QuestionBank from './features/question-bank/QuestionBank';
import Danmaku from './features/danmaku/Danmaku';
import { WaitingRoom } from './features/student-classroom/WaitingRoom';
import { GroupResult } from './features/group-dialogue/GroupResult';
import { PollResult } from './features/group-dialogue/PollResult';
import { ActivityFormModal } from './features/authoring/activity-form/ActivityFormModal';
import { rememberRole, roleFromPath, storedRole } from './entryRole';
import { pathAfterLogin, teacherRoute } from './teacherRoute';
import './styles/style.css';
import './styles/design-library.css';

function DemoSurface({ title, children }) {
  return <section className="sc-demo-surface"><header className="sc-demo-banner"><strong>示範資料</strong><span>{title}</span><a href="/">回課堂首頁</a></header>{children}</section>;
}

// 共思教室入口只持登入狀態與路由；畫面留在各自 feature module。
export default function ClassroomApp() {
  const [user, setUser] = useState(null), [ready, setReady] = useState(false);
  useEffect(() => {
    void api('/auth/me').then(account => {
      setCSRF(account.csrf_token);
      setUser(account);
    }).catch(() => undefined).finally(() => setReady(true));
  }, []);
  useEffect(() => { publishDevAccount(user); }, [user]);
  useEffect(() => {
    const role = roleFromPath(location.pathname);
    if (role) rememberRole(role);
  }, []);
  if (!ready) return <main className="sc-loading"><div className="sc-pulse"/></main>;

  const search = new URLSearchParams(location.search);
  const tokenLink = search.has('reset_token') || search.has('verify_token');
  const pathRole = roleFromPath(location.pathname);
  const routeRole = pathRole || (location.pathname.startsWith('/teacher') ? 'teacher' : location.pathname.startsWith('/student') ? 'student' : null);
  const rememberedRole = storedRole();
  const role = routeRole || rememberedRole || 'student';
  if (!user || tokenLink) {
    if (!tokenLink && location.pathname === '/' && !routeRole && !rememberedRole) return <RoleSelect/>;
    return <Auth variant={role} onLogin={account => {
      rememberRole(role);
      setUser(account);
      history.replaceState({}, '', pathAfterLogin(location.pathname, location.search, location.hash));
    }}/>;
  }

  if (location.pathname === '/question-bank') return <DemoSurface title="教師題庫畫面"><QuestionBank/></DemoSurface>;
  if (location.pathname === '/danmaku') return <DemoSurface title="學生彈幕畫面"><Danmaku/></DemoSurface>;
  if (location.pathname === '/waiting-room') return <DemoSurface title="上課前等待室"><WaitingRoom/></DemoSurface>;
  if (location.pathname === '/group-result') return <DemoSurface title="分組結果"><GroupResult/></DemoSurface>;
  if (location.pathname === '/poll-result') return <DemoSurface title="選項占比"><PollResult/></DemoSurface>;
  if (location.pathname === '/activity-form') return <DemoSurface title="教師出題表單"><ActivityFormModal onClose={() => location.assign('/')} onSubmit={() => location.assign('/')}/></DemoSurface>;

  const room = location.pathname.match(/^\/classrooms\/([\w-]+)/);
  if (room) return <Classroom user={user} id={room[1]}/>;
  const teacher = teacherRoute(location.pathname, user.verified);
  if (teacher?.page === 'verify') return <VerificationGate user={user} onVerified={() => location.reload()}/>;
  if (teacher?.page === 'home') return <TeacherDashboard user={user}/>;
  if (teacher?.page === 'course') return <TeacherShell active="home"><ClassroomLibrary initialSelected={teacher.courseId}/></TeacherShell>;
  return <Home user={user}/>;
}
