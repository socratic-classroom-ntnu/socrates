import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../../contract/classroomClient'
import type { components } from '../../../contract/classroomTypes'
import { useResource } from '../../../contract/useResource'
import { Button, QrCode } from '../../../ui'
import { useT } from '../../../i18n/useT'
import styles from './projector.module.css'

type Course = components['schemas']['CourseTeacherView']
type Activity = components['schemas']['ActivityTeacherView']

const cx = (...names: string[]) => names.map(name => styles[name]).join(' ')

function useEscapeToCourse(courseId: string) {
  const navigate = useNavigate()
  useEffect(() => {
    let fallback: ReturnType<typeof setTimeout> | undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      window.close()
      fallback = setTimeout(() => {
        if (!window.closed) navigate(courseId ? `/teach/courses/${courseId}` : '/?tab=teach', { replace: true })
      }, 500)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (fallback) clearTimeout(fallback)
    }
  }, [courseId, navigate])
}

function EscapeHint() {
  const { t } = useT('teach')
  return <div className={cx('escapeHint')}>{t('projectorPage.escapeHintBefore')} <kbd>Esc</kbd> {t('projectorPage.escapeHintAfter')}</div>
}

function LoadingScreen() {
  const { t } = useT('teach')
  return <main className={cx('page')} aria-label={t('projectorPage.loading')} aria-busy="true">
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
  icon = '!',
  busy = false,
}: {
  eyebrow: string
  title: string
  description: string
  icon?: string
  action?: { label: string; onClick(): void; disabled?: boolean }
  busy?: boolean
}) {
  return <main className={cx('page', 'statusPage')} aria-busy={busy}>
    <section className={cx('statusCard')} role={action ? undefined : 'status'}>
      <div className={cx('statusIcon')} aria-hidden="true">{icon}</div>
      <div className={cx('eyebrow')}>{eyebrow}</div>
      <h1>{title}</h1>
      <p>{description}</p>
      {action && <Button className={cx('retry')} onClick={action.onClick} disabled={action.disabled}>{action.label}</Button>}
    </section>
    <EscapeHint />
  </main>
}

function LoadError({
  error,
  resource,
  reload,
}: {
  error: unknown
  resource: 'course' | 'activity' | 'parentCourse'
  reload(): Promise<void>
}) {
  const { t } = useT('teach')
  const notFound = error instanceof ApiError && error.status === 404
  const resourceName = t(`projectorPage.resources.${resource}`)
  const [retrying, setRetrying] = useState(false)
  const retry = () => {
    setRetrying(true)
    void reload().finally(() => setRetrying(false))
  }
  return <StatusScreen
    eyebrow={t('projectorPage.loadError')}
    title={notFound ? t('projectorPage.notFoundTitle', { resource: resourceName }) : t('projectorPage.loadErrorTitle')}
    description={notFound ? t('projectorPage.notFoundDescription', { resource: resourceName }) : t('projectorPage.loadErrorDescription')}
    action={{ label: retrying ? t('projectorPage.retrying') : t('projectorPage.retry'), onClick: retry, disabled: retrying }}
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
  const { t } = useT('teach')
  const isActivity = parentCourse !== undefined
  return <main className={cx('page')}>
    <div className={cx('join')}>
      <section className={cx('qrColumn')}>
        <div className={cx('qr')}><QrCode value={url} alt={t('projectorPage.qrAlt', { name })} size={480} /></div>
      </section>
      <section className={cx('copy')}>
        <div>
          <div className={cx('eyebrow')}>{isActivity ? t('projectorPage.activity') : t('projectorPage.joinCourse')}</div>
          {isActivity && <div className={cx('parentCourse')}>{parentCourse}</div>}
          <h1>{name}</h1>
          <p className={cx('description')}>{isActivity
            ? upcoming ? t('projectorPage.activityUpcoming') : t('projectorPage.activityJoin')
            : t('projectorPage.courseJoin')}</p>
        </div>
        {code
          ? <div className={cx('codeBlock')}><span>{t('projectorPage.courseCode')}</span><strong>{code}</strong></div>
          : <div className={cx('scanNote')}>{t('projectorPage.scanToJoin')}</div>}
      </section>
    </div>
    <EscapeHint />
  </main>
}

function CourseDisabled({ name }: { name: string }) {
  const { t } = useT('teach')
  return <StatusScreen eyebrow={t('projectorPage.courseCode')} title={t('projectorPage.courseDisabled')} description={t('projectorPage.courseDisabledDescription', { name })} icon="▤" />
}

function ActivityScreen({ activity, courseName }: { activity: Activity; courseName: string }) {
  const { t } = useT('teach')
  if (activity.status === 'ended') {
    return <StatusScreen eyebrow={t('projectorPage.activityStatus')} title={t('projectorPage.activityEnded')} description={t('projectorPage.activityEndedDescription', { name: activity.draft.title })} icon="✓" />
  }
  if (activity.status === 'draft') {
    return <StatusScreen eyebrow={t('projectorPage.activityStatus')} title={t('projectorPage.activityDraft')} description={t('projectorPage.activityDraftDescription', { name: activity.draft.title })} icon="▤" />
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
  if (!course.data) return <LoadError error={course.error} resource="course" reload={course.reload} />
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
  if (!activity.data) return <LoadError error={activity.error} resource="activity" reload={activity.reload} />
  if (course.loading && !course.data) return <LoadingScreen />
  if (!course.data) return <LoadError error={course.error} resource="parentCourse" reload={course.reload} />

  return <ActivityScreen activity={activity.data} courseName={course.data.name} />
}
