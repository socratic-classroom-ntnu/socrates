import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import type { components } from '../api/classroomTypes'
import { useResource } from '../api/useResource'
import {
  LegacyClassroomRoute,
  LegacyTeacherCourseRoute,
  LegacyTeacherRoute,
} from '../ClassroomApp'
import { useT } from '../i18n/useT'
import Conversation from '../pages/Conversation'
import { ComingSoonPage, NotFoundPage } from '../pages/ComingSoonPage'
import { GroupsPage } from '../pages/groups/GroupsPage'
import { HomePage } from '../pages/home/HomePage'
import { JoinActivityPage } from '../pages/join/JoinActivityPage'
import { JoinCoursePage } from '../pages/join/JoinCoursePage'
import { StudentCoursePage } from '../pages/learn/StudentCoursePage'
import { TeacherCoursePage } from '../pages/teach/TeacherCoursePage'
import { ActivityEditorPage } from '../pages/teach/editor/ActivityEditorPage'
import { CreateCourseRedirect, TeacherDesktopOnly } from '../pages/teach/TeacherDesktopOnly'
import History from '../pages/History'
import Round1Home from '../pages/Home'
import Summary from '../pages/Summary'
import { LoginPage } from '../pages/auth/LoginPage'
import { VerifyPage } from '../pages/auth/VerifyPage'
import Round1Layout from '../Round1App'
import { AppShell } from './AppShell'
import { RequireAuth } from './RequireAuth'

// 舊網址上的一次性 token 先轉到專用頁，不放進一般的登入返回網址。
// 舊學生首頁的 AI 連線設定分頁搬到「分組課」頁。
function legacyRedirect(pathname: string, search: string): string | null {
  const params = new URLSearchParams(search)
  const verify = params.get('verify_token')
  if (verify) return '/verify?token=' + encodeURIComponent(verify)
  const reset = params.get('reset_token')
  if (reset) return '/login?mode=reset&token=' + encodeURIComponent(reset)
  if (pathname === '/' && params.get('view') === 'providers') return '/groups?view=providers'
  return null
}

type PlaceholderKind = 'scan' | 'account' | 'activity' | 'live' | 'analysis' | 'projector'

// 這一批不做的入口（spec §4.7）：共用佔位頁，說明文字依入口換。
function Placeholder({ kind }: { kind?: PlaceholderKind }) {
  const { t } = useT('common')
  return <ComingSoonPage body={kind ? t(`comingSoon.${kind}`) : undefined} />
}

// 教師端的佔位頁回到所屬課程；活動頁要先查活動才知道課程，查不到就回「我的授課」
function TeachPlaceholder({ kind }: { kind: PlaceholderKind }) {
  const { t } = useT('common')
  const { courseId, activityId } = useParams()
  const activity = useResource<components['schemas']['ActivityTeacherView']>(activityId ? `/activities/${activityId}` : null)
  const owner = courseId ?? activity.data?.course_id
  return <ComingSoonPage
    body={t(`comingSoon.${kind}`)}
    backTo={owner ? `/teach/courses/${owner}` : '/?tab=teach'}
    backLabel={t('comingSoon.toCourse')}
  />
}

export function AppRoutes() {
  const { pathname, search } = useLocation()
  const redirect = legacyRedirect(pathname, search)
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
      {/* 分組教室維持全螢幕；分組課頁沿用舊首頁，舊首頁不要求驗證（加入時由後端擋） */}
      <Route path="/classrooms/:roomId" element={<LegacyClassroomRoute />} />
      <Route element={<AppShell />}>
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/scan" element={<Placeholder kind="scan" />} />
        <Route path="/account" element={<Placeholder kind="account" />} />
      </Route>
    </Route>
    <Route element={<RequireAuth verified />}>
      {/* 加入流程與投影是全螢幕，不包外框 */}
      <Route path="/join" element={<JoinCoursePage />} />
      <Route path="/activities/:activityId/join" element={<JoinActivityPage />} />
      <Route element={<TeacherDesktopOnly />}>
        <Route path="/teach/courses/:courseId/projector" element={<TeachPlaceholder kind="projector" />} />
        <Route path="/teach/activities/:activityId/projector" element={<TeachPlaceholder kind="projector" />} />
      </Route>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/learn/courses/:courseId" element={<StudentCoursePage />} />
        <Route path="/learn/activities/:activityId" element={<Placeholder kind="activity" />} />
        {/* 教師端只做電腦版：手機寬度一律 S4m */}
        <Route element={<TeacherDesktopOnly />}>
          <Route path="/teach/create-course" element={<CreateCourseRedirect />} />
          <Route path="/teach/courses/:courseId" element={<TeacherCoursePage />} />
          <Route path="/teach/courses/:courseId/students" element={<TeacherCoursePage />} />
          <Route path="/teach/courses/:courseId/settings" element={<TeacherCoursePage />} />
          <Route path="/teach/courses/:courseId/activities/new" element={<ActivityEditorPage />} />
          <Route path="/teach/activities/:activityId/edit" element={<ActivityEditorPage />} />
          <Route path="/teach/activities/:activityId" element={<TeachPlaceholder kind="live" />} />
          <Route path="/teach/activities/:activityId/analysis" element={<TeachPlaceholder kind="analysis" />} />
        </Route>
        <Route path="/teacher/home" element={<LegacyTeacherRoute />} />
        <Route path="/teacher/courses/:courseId" element={<LegacyTeacherCourseRoute />} />
      </Route>
    </Route>
    <Route path="*" element={<NotFoundPage />} />
  </Routes>
}
