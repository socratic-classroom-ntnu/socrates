import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../../contract/classroomClient'
import type { components } from '../../../contract/classroomTypes'
import { useResource } from '../../../contract/useResource'
import { QrCode } from '../../../ui'
import styles from './projector.module.css'

type Course = components['schemas']['CourseTeacherView']
type Activity = components['schemas']['ActivityTeacherView']

const cx = (...names: string[]) => names.map(name => styles[name]).join(' ')

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
  return <div className={cx('escapeHint')}>按 <kbd>Esc</kbd> 離開投影</div>
}

function LoadingScreen() {
  return <main className={cx('page')} aria-label="載入投影畫面" aria-busy="true">
    <div className={cx('join', 'loading')}>
      <section className={cx('qrColumn')}><div className={cx('qrSkeleton')}><span /></div></section>
      <section className={cx('copy')}>
        <div><div className={cx('skeleton', 'skeletonEyebrow')} /><div className={cx('skeleton', 'skeletonTitle')} /><div className={cx('skeleton', 'skeletonCopy')} /><div className={cx('skeleton', 'skeletonCopy', 'skeletonShort')} /></div>
        <div><div className={cx('skeleton', 'skeletonLabel')} /><div className={cx('skeleton', 'skeletonCode')} /></div>
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
  return <main className={cx('page', 'statusPage')} aria-busy={busy}>
    <section className={cx('statusCard')} role={action ? undefined : 'status'}>
      <div className={cx('statusIcon')} aria-hidden="true">{eyebrow === '活動狀態' ? '✓' : eyebrow === '課程狀態' ? '▤' : '!'}</div>
      <div className={cx('eyebrow')}>{eyebrow}</div>
      <h1>{title}</h1>
      <p>{description}</p>
      {action && <button type="button" className={cx('retry')} onClick={action.onClick} disabled={action.disabled}>{action.label}</button>}
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
  return <main className={cx('page')}>
    <div className={cx('join')}>
      <section className={cx('qrColumn')}>
        <div className={cx('qr')}><QrCode value={url} alt={`加入「${name}」的 QR Code`} size={480} /></div>
      </section>
      <section className={cx('copy')}>
        <div>
          <div className={cx('eyebrow')}>{isActivity ? '課堂活動' : upcoming ? '即將開始' : '加入課程'}</div>
          {isActivity && <div className={cx('parentCourse')}>{parentCourse}</div>}
          <h1>{name}</h1>
          <p className={cx('description')}>{isActivity
            ? upcoming ? '活動即將開始，你可以先掃描 QR Code，準備加入。' : '使用手機掃描 QR Code，加入這個課堂活動。'
            : upcoming
              ? '課程尚未開始，你可以先掃描 QR Code 或輸入代碼加入。'
              : '使用手機掃描 QR Code，或輸入課程代碼加入。'}</p>
        </div>
        {code
          ? <div className={cx('codeBlock')}><span>課程代碼</span><strong>{code}</strong></div>
          : <div className={cx('scanNote')}>掃描後即可參與活動</div>}
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
