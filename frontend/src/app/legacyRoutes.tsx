// 分組課的樣式照原本 ClassroomApp 載入的順序先排好：全域樣式表裡同樣權重的規則，後載入的贏。
// 元件自己也會 import 這些檔，之後不會再載一次。順序由 app/styleOrder.test.ts 守住。
import '../styles/entrance.css'
import '../styles/email-verification.css'
import '../features/avatar/tutor-avatar.css'
import '../shared/input/composer.css'
import '../styles/research.css'
import '../features/classroom-answer/answerStage.css'
import '../styles/provider-settings.css'
import '../styles/group.css'
import '../features/teacher-records/teacher-records.css'
import '../styles/script-builder.css'
import '../styles/question-bank.css'
import '../styles/teacher-dashboard.css'
import '../features/question-bank/QuestionBank.css'
import '../features/danmaku/Danmaku.css'
import '../features/student-classroom/WaitingRoom.css'
import '../features/group-dialogue/GroupResult.css'
import '../features/group-dialogue/PollResult.css'
import '../features/authoring/activity-form/activity-form.css'
import '../styles/style.css'
import '../styles/design-library.css'
import { useParams } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { ClassroomLibrary } from '../features/authoring/ClassroomLibrary'
import { TeacherDashboard, TeacherShell } from '../features/authoring/TeacherDashboard'
import { Classroom } from '../features/student-classroom/Classroom'

// 單一路由器（app/routes.tsx）掛的分組課頁：登入守門由 RequireAuth 負責，這裡只取帳號與網址參數。
export function LegacyClassroomRoute() {
  const { account } = useAuth()
  const { roomId } = useParams()
  return <Classroom key={roomId} user={account} id={roomId} />
}

export function LegacyTeacherRoute() {
  const { account } = useAuth()
  return <TeacherDashboard user={account} />
}

export function LegacyTeacherCourseRoute() {
  const { courseId } = useParams()
  return <TeacherShell active="home"><ClassroomLibrary key={courseId} initialSelected={courseId} /></TeacherShell>
}
