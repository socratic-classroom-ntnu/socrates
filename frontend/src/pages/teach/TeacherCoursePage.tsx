import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ApiError } from '../../api/classroomClient'
import type { components } from '../../api/classroomTypes'
import { useResource } from '../../api/useResource'
import { errorMessage } from '../../i18n/errors'
import { useT } from '../../i18n/useT'
import { ComingSoonPage } from '../ComingSoonPage'
import { ActivityCards } from './ActivityCards'
import { InviteDialog } from './InviteDialog'
import '../../styles/teach.css'

type Course = components['schemas']['CourseTeacherView']
type Tab = 'activities' | 'students' | 'settings'

function tabOf(pathname: string): Tab {
  if (pathname.endsWith('/students')) return 'students'
  if (pathname.endsWith('/settings')) return 'settings'
  return 'activities'
}

/** T2／T4 frame: header, invite, the three tabs. The activity cards come from ActivityList. */
export function TeacherCoursePage() {
  const { t } = useT('teach')
  const { courseId = '' } = useParams()
  const { pathname } = useLocation()
  const tab = tabOf(pathname)
  const course = useResource<Course>(`/courses/${courseId}?role=teacher`)
  const [inviting, setInviting] = useState(false)

  if (course.loading && !course.data) return <main className="teach-page" aria-busy="true" />
  if (!course.data) {
    const notFound = course.error instanceof ApiError && course.error.status === 404
    return <main className="teach-page teach-page--message">
      <h1>{notFound ? t('course.notFound.title') : errorMessage(t, course.error)}</h1>
      {notFound && <p>{t('course.notFound.body')}</p>}
      <Link className="button button--outline" to="/">{t('course.notFound.back')}</Link>
    </main>
  }

  const data = course.data
  const base = `/teach/courses/${data.id}`
  const tabs: { key: Tab; to: string; label: string; count?: number }[] = [
    { key: 'activities', to: base, label: t('course.tabs.activities') },
    { key: 'students', to: base + '/students', label: t('course.tabs.students'), count: data.student_count },
    { key: 'settings', to: base + '/settings', label: t('course.tabs.settings') },
  ]

  return <main className="teach-page">
    <header className="teach-head">
      <div className="teach-head__title">
        <nav className="teach-head__crumb" aria-label={t('course.breadcrumbLabel')}>
          <Link to="/?tab=teach">{t('course.breadcrumb')}</Link> <span aria-hidden="true">/</span>
        </nav>
        <h1>{data.name}</h1>
        <span className="teach-head__meta">{t('course.meta', { teacher: data.teacher_name, count: data.student_count })}</span>
      </div>
      <button type="button" className="button button--outline" onClick={() => setInviting(true)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v7h-7" /></svg>
        {t('course.invite')}
      </button>
    </header>
    <nav className="teach-tabs" aria-label={t('course.tabsLabel')}>
      {tabs.map(item => <Link key={item.key} to={item.to} aria-current={tab === item.key ? 'page' : undefined}>
        {item.label}{item.count !== undefined && <span className="teach-tabs__count"> {item.count}</span>}
      </Link>)}
    </nav>
    {tab === 'activities' && <ActivityCards courseId={data.id} canCreate={data.available_actions.includes('create_activity')} />}
    {tab === 'students' && <ComingSoonPage variant="panel" body={t('course.studentsSoon')} backTo={base} backLabel={t('course.backToActivities')} />}
    {tab === 'settings' && <ComingSoonPage variant="panel" body={t('course.settingsSoon')} backTo={base} backLabel={t('course.backToActivities')} />}
    {inviting && <InviteDialog
      kind="course"
      name={data.name}
      code={data.code}
      url={`${window.location.origin}/join?code=${data.code}`}
      projectorTo={base + '/projector'}
      disabled={!data.code_enabled}
      onClose={() => setInviting(false)}
    />}
  </main>
}
