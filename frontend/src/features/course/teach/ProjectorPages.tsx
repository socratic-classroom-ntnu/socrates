import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../../contract/classroomClient'
import type { components } from '../../../contract/classroomTypes'
import { useResource } from '../../../contract/useResource'
import { QrCode } from '../../../ui'
import '../../../styles/projector.css'

type Course = components['schemas']['CourseTeacherView']
type Activity = components['schemas']['ActivityTeacherView']

function useEscapeToCourse(courseId: string) {
  const navigate = useNavigate()
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') navigate(courseId ? `/teach/courses/${courseId}` : '/?tab=teach')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [courseId, navigate])
}

function EscapeHint() {
  return <div className="projector-escape-hint">按 <kbd>Esc</kbd> 離開投影</div>
}

function LoadingScreen() {
  return <main className="projector-page" aria-label="載入投影畫面" aria-busy="true">
    <div className="projector-join projector-loading">
      <section className="projector-qr-column"><div className="projector-qr-skeleton"><span /></div></section>
      <section className="projector-copy">
        <div><div className="projector-skeleton projector-skeleton--eyebrow" /><div className="projector-skeleton projector-skeleton--title" /><div className="projector-skeleton projector-skeleton--copy" /><div className="projector-skeleton projector-skeleton--copy projector-skeleton--short" /></div>
        <div><div className="projector-skeleton projector-skeleton--label" /><div className="projector-skeleton projector-skeleton--code" /></div>
      </section>
    </div>
    <EscapeHint />
  </main>
}

function StatusScreen({
  eyebrow,
  title,
  description,
  action,
  busy = false,
}: {
  eyebrow: string
  title: string
  description: string
  action?: { label: string; onClick(): void; disabled?: boolean }
  busy?: boolean
}) {
  return <main className="projector-page projector-page--status" aria-busy={busy}>
    <section className="projector-status-card" role={action ? undefined : 'status'}>
      <div className="projector-status-icon" aria-hidden="true">{eyebrow === '活動狀態' ? '✓' : eyebrow === '課程狀態' ? '▤' : '!'}</div>
      <div className="projector-eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      <p>{description}</p>
      {action && <button type="button" className="projector-retry" onClick={action.onClick} disabled={action.disabled}>{action.label}</button>}
    </section>
    <EscapeHint />
  </main>
}

function LoadError({
  error,
  resourceName,
  reload,
}: {
  error: unknown
  resourceName: string
  reload(): Promise<void>
}) {
  const notFound = error instanceof ApiError && error.status === 404
  const [retrying, setRetrying] = useState(false)
  const retry = () => {
    setRetrying(true)
    void reload().finally(() => setRetrying(false))
  }
  return <StatusScreen
    eyebrow="載入失敗"
    title={notFound ? `找不到${resourceName}` : '無法顯示加入資訊'}
    description={notFound ? `請確認${resourceName}網址是否正確。` : '請確認網路連線，或重新載入投影畫面。'}
    action={{ label: retrying ? '正在重新載入…' : '重新載入', onClick: retry, disabled: retrying }}
    busy={retrying}
  />
}

function JoinScreen({
  name,
  parentCourse,
  url,
  code,
  upcoming = false,
}: {
  name: string
  parentCourse?: string
  url: string
  code?: string
  upcoming?: boolean
}) {
  const isActivity = parentCourse !== undefined
  return <main className="projector-page">
    <div className="projector-join">
      <section className="projector-qr-column">
        <div className="projector-qr"><QrCode value={url} alt={`加入「${name}」的 QR Code`} size={480} /></div>
      </section>
      <section className="projector-copy">
        <div>
          <div className="projector-eyebrow">{isActivity ? '課堂活動' : upcoming ? '即將開始' : '加入課程'}</div>
          {isActivity && <div className="projector-parent-course">{parentCourse}</div>}
          <h1>{name}</h1>
          <p className="projector-description">{isActivity
            ? upcoming ? '活動即將開始，你可以先掃描 QR Code，準備加入。' : '使用手機掃描 QR Code，加入這個課堂活動。'
            : upcoming
              ? '課程尚未開始，你可以先掃描 QR Code 或輸入代碼加入。'
              : '使用手機掃描 QR Code，或輸入課程代碼加入。'}</p>
        </div>
        {code
          ? <div className="projector-code-block"><span>課程代碼</span><strong>{code}</strong></div>
          : <div className="projector-scan-note">掃描後即可參與活動</div>}
      </section>
    </div>
    <EscapeHint />
  </main>
}

function CourseDisabled({ name }: { name: string }) {
  return <StatusScreen eyebrow="課程代碼" title="此課程代碼已停用" description={`目前無法使用課程代碼加入「${name}」。`} />
}

function ActivityScreen({ activity, courseName }: { activity: Activity; courseName: string }) {
  if (activity.status === 'ended') {
    return <StatusScreen eyebrow="活動狀態" title="活動已結束" description={`「${activity.draft.title}」已經結束，現在無法加入。`} />
  }
  if (activity.status === 'draft') {
    return <StatusScreen eyebrow="活動狀態" title="活動尚未開放" description={`「${activity.draft.title}」目前仍是草稿，發布後學生才能加入。`} />
  }
  return <JoinScreen
    name={activity.draft.title}
    parentCourse={courseName}
    url={`${window.location.origin}/activities/${activity.id}/join`}
    upcoming={activity.status === 'scheduled'}
  />
}

export function CourseProjectorPage() {
  const { courseId = '' } = useParams()
  useEscapeToCourse(courseId)
  const course = useResource<Course>(courseId ? `/courses/${courseId}?role=teacher` : null)

  if (course.loading && !course.data) return <LoadingScreen />
  if (!course.data) return <LoadError error={course.error} resourceName="課程" reload={course.reload} />
  if (!course.data.code_enabled) return <CourseDisabled name={course.data.name} />

  return <JoinScreen
    name={course.data.name}
    code={course.data.code}
    url={`${window.location.origin}/join?code=${course.data.code}`}
  />
}

export function ActivityProjectorPage() {
  const { activityId = '' } = useParams()
  const activity = useResource<Activity>(activityId ? `/activities/${activityId}` : null)
  const course = useResource<Course>(activity.data ? `/courses/${activity.data.course_id}?role=teacher` : null)
  useEscapeToCourse(activity.data?.course_id ?? '')

  if (activity.loading && !activity.data) return <LoadingScreen />
  if (!activity.data) return <LoadError error={activity.error} resourceName="活動" reload={activity.reload} />
  if (course.loading && !course.data) return <LoadingScreen />
  if (!course.data) return <LoadError error={course.error} resourceName="所屬課程" reload={course.reload} />

  return <ActivityScreen activity={activity.data} courseName={course.data.name} />
}
