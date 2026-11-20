import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import type { components } from '../contract/classroomTypes'
import { useResource } from '../contract/useResource'
import { useT } from '../i18n/useT'
import { Button, ButtonLink } from '../ui'
import { useLogout } from './accountSummary'
import type { PageSide } from './pageSide'
import '../styles/cross-role.css'

type JoinPreview = components['schemas']['JoinPreview']
type ActivityJoinPreview = components['schemas']['ActivityJoinPreview']

/** X5s／X5t（電腦）、X5sm／X5tm（手機）、X5q（老師帳號掃 QR）：帳號打開另一邊的頁面。 */
export function CrossRolePage({ side }: { side: PageSide }) {
  const { t } = useT('shell')
  // 訪客也會走到這裡（訪客是學生）：登出一樣先確認（G15）
  const logout = useLogout()
  const join = useJoinTarget(side)
  // 學生頁 → 帳號是老師；老師頁 → 帳號是學生
  const copy = join ? 'crossRole.join' : side === 'teacher' ? 'crossRole.teacherPage' : 'crossRole.studentPage'
  const other = side === 'teacher' ? 'teacher' : 'student'

  return <main className="cross-role">
    <section className="cross-role__card" aria-labelledby="cross-role-title">
      <TwoDoors label={t('crossRole.illustration')} />
      <div className="cross-role__text">
        {join?.courseName && <p className="cross-role__scanned">
          <span>{t(join.kind === 'course' ? 'crossRole.join.scannedCourse' : 'crossRole.join.scannedActivity')}</span>
          <b>{join.courseName}</b>
        </p>}
        <h1 id="cross-role-title">{t(`${copy}.title`)}</h1>
        <p className="cross-role__body">
          <span>{t(`${copy}.body1`)}</span>
          <span>{t(`${copy}.body2`)}</span>
        </p>
        <div className="cross-role__actions">
          <ButtonLink variant="primary" className="cross-role__home" to="/">{t('crossRole.home')}</ButtonLink>
          <Button variant="quiet" onClick={logout.request}>
            {t(`crossRole.switch.${other}`)}
          </Button>
        </div>
      </div>
    </section>
    {logout.confirm}
  </main>
}

type JoinTarget = { kind: 'course' | 'activity'; courseName: string | null }

/** 老師帳號打開加入課程／加入活動網址時，用預覽拿課名（P18）；其他說明頁不發 API。 */
function useJoinTarget(side: PageSide): JoinTarget | null {
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const { activityId } = useParams()
  const code = params.get('code')
  const course = side === 'student' && /^\/join\/?$/.test(pathname)
  const activity = side === 'student' && !!activityId && /\/join\/?$/.test(pathname)
  const coursePreview = useResource<JoinPreview>(course && code ? `/course-join/preview?code=${encodeURIComponent(code)}` : null)
  const activityPreview = useResource<ActivityJoinPreview>(activity ? `/activities/${activityId}/join-preview` : null)
  if (course) return { kind: 'course', courseName: coursePreview.data?.name ?? null }
  if (activity) return { kind: 'activity', courseName: activityPreview.data?.course_name ?? null }
  return null
}

function TwoDoors({ label }: { label: string }) {
  return <svg className="cross-role__illustration" role="img" aria-label={label} width="260" height="200" viewBox="0 0 260 200">
    <circle cx="130" cy="100" r="92" className="cross-role__halo" />
    <rect x="62" y="52" width="60" height="118" rx="4" className="cross-role__door cross-role__door--open" strokeWidth="4" />
    <rect x="74" y="66" width="36" height="12" rx="3" className="cross-role__plate cross-role__plate--open" />
    <circle cx="110" cy="114" r="4" className="cross-role__knob" />
    <rect x="138" y="52" width="60" height="118" rx="4" className="cross-role__door cross-role__door--locked" strokeWidth="4" />
    <rect x="150" y="66" width="36" height="12" rx="3" className="cross-role__plate cross-role__plate--locked" />
    <path d="M161 104v-6a7 7 0 0 1 14 0v6" className="cross-role__shackle" strokeWidth="3" fill="none" />
    <rect x="155" y="104" width="26" height="20" rx="3" className="cross-role__lock" />
    <rect x="40" y="172" width="180" height="3" rx="1.5" className="cross-role__floor" />
  </svg>
}
