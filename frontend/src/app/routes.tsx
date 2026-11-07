import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
// 分組課的頁面先 import：它們帶進的全域樣式要排在外框與課程頁的 CSS 前面，後者才蓋得過。
// 下面課程頁的 import 照搬來之前的順序排，課程與外框的樣式表之間才會照原本的順序疊。順序由 app/styleOrder.test.ts 守住。
import {
  LegacyClassroomRoute,
  LegacyTeacherCourseRoute,
  LegacyTeacherRoute,
} from './legacyRoutes'
import { ActivityFormModal } from '../features/authoring/activity-form/ActivityFormModal'
import Danmaku from '../features/danmaku/Danmaku'
import { GroupResult } from '../features/group-dialogue/GroupResult'
import { PollResult } from '../features/group-dialogue/PollResult'
import QuestionBank from '../features/question-bank/QuestionBank'
import { WaitingRoom } from '../features/student-classroom/WaitingRoom'
import type { components } from '../contract/classroomTypes'
import { useResource } from '../contract/useResource'
import { useT } from '../i18n/useT'
// 元件庫的樣式（CSS Modules，還沒進 @layer，D20）在所有課程頁之前載入一次，頁面傳進去的 className 才蓋得過；順序由 styleOrder.test.ts 守住
import '../ui'
import { ComingSoonPage, NotFoundPage } from '../components/ComingSoonPage'
import { GroupsPage } from '../features/student-classroom/GroupsPage'
import { HomePage } from '../features/course/home/HomePage'
import { JoinActivityPage } from '../features/course/join/JoinActivityPage'
import { JoinCoursePage } from '../features/course/join/JoinCoursePage'
import { StudentCoursePage } from '../features/course/learn/StudentCoursePage'
import { SoloActivityPage } from '../features/solo-activity/SoloActivityPage'
import { SoloDialoguePage } from '../features/solo-activity/SoloDialoguePage'
import { TeacherCoursePage } from '../features/course/teach/TeacherCoursePage'
import { TeacherAnalysisPage } from '../features/course/teach/TeacherAnalysisPage'
import { TeacherLivePage } from '../features/course/teach/TeacherLivePage'
import { ActivityEditorPage } from '../features/course/teach/editor/ActivityEditorPage'
import { CreateCourseRedirect, TeacherDesktopOnly } from '../features/course/teach/TeacherDesktopOnly'
import { LoginPage } from '../features/auth/LoginPage'
import { VerifyPage } from '../features/auth/VerifyPage'
import { AppShell } from './AppShell'
import { RequireAuth } from '../features/auth/RequireAuth'
import { DemoSurface } from './DemoSurface'

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

type PlaceholderKind = 'scan' | 'account' | 'activity' | 'live' | 'analysis' | 'aiAnalysis' | 'projector'

// 這一批不做的入口：共用佔位頁，說明文字依入口換。
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
    <Route element={<RequireAuth />}>
      {/* 分組教室維持全螢幕；分組課頁沿用舊首頁，舊首頁不要求驗證（加入時由後端擋） */}
      <Route path="/classrooms/:roomId" element={<LegacyClassroomRoute />} />
      {/* 寫死資料的示範頁：要登入才看得到，外框標明「示範資料」 */}
      <Route path="/question-bank" element={<DemoSurface title="教師題庫畫面"><QuestionBank /></DemoSurface>} />
      <Route path="/danmaku" element={<DemoSurface title="學生彈幕畫面"><Danmaku /></DemoSurface>} />
      <Route path="/waiting-room" element={<DemoSurface title="上課前等待室"><WaitingRoom /></DemoSurface>} />
      <Route path="/group-result" element={<DemoSurface title="分組結果"><GroupResult /></DemoSurface>} />
      <Route path="/poll-result" element={<DemoSurface title="選項占比"><PollResult /></DemoSurface>} />
      <Route path="/activity-form" element={<DemoSurface title="教師出題表單"><ActivityFormModal onClose={() => location.assign('/')} onSubmit={() => location.assign('/')} /></DemoSurface>} />
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
      <Route path="/learn/activities/:activityId/dialogue" element={<SoloDialoguePage />} />
      <Route element={<TeacherDesktopOnly />}>
        <Route path="/teach/courses/:courseId/projector" element={<TeachPlaceholder kind="projector" />} />
        <Route path="/teach/activities/:activityId/projector" element={<TeachPlaceholder kind="projector" />} />
      </Route>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/learn/courses/:courseId" element={<StudentCoursePage />} />
        <Route path="/learn/activities/:activityId" element={<SoloActivityPage />} />
        {/* 教師端只做電腦版：手機寬度一律 S4m */}
        <Route element={<TeacherDesktopOnly />}>
          <Route path="/teach/create-course" element={<CreateCourseRedirect />} />
          <Route path="/teach/courses/:courseId" element={<TeacherCoursePage />} />
          <Route path="/teach/courses/:courseId/students" element={<TeacherCoursePage />} />
          <Route path="/teach/courses/:courseId/settings" element={<TeacherCoursePage />} />
          <Route path="/teach/courses/:courseId/activities/new" element={<ActivityEditorPage />} />
          <Route path="/teach/activities/:activityId/edit" element={<ActivityEditorPage />} />
          <Route path="/teach/activities/:activityId" element={<TeacherLivePage />} />
          <Route path="/teach/activities/:activityId/analysis" element={<TeacherAnalysisPage />} />
          <Route path="/teach/activities/:activityId/analysis/ai" element={<TeachPlaceholder kind="aiAnalysis" />} />
        </Route>
        <Route path="/teacher/home" element={<LegacyTeacherRoute />} />
        <Route path="/teacher/courses/:courseId" element={<LegacyTeacherCourseRoute />} />
      </Route>
    </Route>
    <Route path="*" element={<NotFoundPage />} />
  </Routes>
}
