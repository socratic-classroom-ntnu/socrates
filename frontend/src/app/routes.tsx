import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import {
  LegacyClassroomRoute,
  LegacyStudentHome,
  LegacyTeacherCourseRoute,
  LegacyTeacherRoute,
} from '../ClassroomApp'
import Conversation from '../pages/Conversation'
import { ComingSoonPage, NotFoundPage } from '../pages/ComingSoonPage'
import History from '../pages/History'
import Round1Home from '../pages/Home'
import Summary from '../pages/Summary'
import { LoginPage } from '../pages/auth/LoginPage'
import { VerifyPage } from '../pages/auth/VerifyPage'
import Round1Layout from '../Round1App'
import { AppShell } from './AppShell'
import { RequireAuth } from './RequireAuth'

// 舊網址上的一次性 token 先轉到專用頁，不放進一般的登入返回網址。
function oneTimeRedirect(search: string): string | null {
  const params = new URLSearchParams(search)
  const verify = params.get('verify_token')
  if (verify) return '/verify?token=' + encodeURIComponent(verify)
  const reset = params.get('reset_token')
  if (reset) return '/login?mode=reset&token=' + encodeURIComponent(reset)
  return null
}

export function AppRoutes() {
  const { search } = useLocation()
  const redirect = oneTimeRedirect(search)
  if (redirect) return <Navigate to={redirect} replace />
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/verify" element={<VerifyPage />} />
    <Route element={<Round1Layout />}>
      <Route path="/round1" element={<Round1Home />} />
      <Route path="/history" element={<History />} />
      <Route path="/sessions/:sessionId" element={<Conversation />} />
      <Route path="/sessions/:sessionId/summary" element={<Summary />} />
    </Route>
    <Route element={<RequireAuth />}>
      {/* 教室與活動加入維持全螢幕；首頁與教師端包在新外框裡 */}
      <Route path="/classrooms/:roomId" element={<LegacyClassroomRoute />} />
      <Route path="/activities/:activityId/join" element={<ComingSoonPage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<LegacyStudentHome />} />
      </Route>
    </Route>
    <Route element={<RequireAuth verified />}>
      <Route element={<AppShell />}>
        <Route path="/teacher/home" element={<LegacyTeacherRoute />} />
        <Route path="/teacher/courses/:courseId" element={<LegacyTeacherCourseRoute />} />
      </Route>
    </Route>
    <Route path="*" element={<NotFoundPage />} />
  </Routes>
}
