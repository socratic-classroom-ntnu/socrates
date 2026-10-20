import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/classroomClient'
import type { components } from '../../api/classroomTypes'
import { useResource } from '../../api/useResource'
import { Dialog } from '../../components/Dialog'
import { errorMessage } from '../../i18n/errors'
import { formatDateTime } from '../../i18n/format'
import { useT } from '../../i18n/useT'

type Activity = Pick<components['schemas']['SoloActivityProgressView'],
  'activity_id' | 'title' | 'course_id' | 'course_name' | 'status' | 'question_count' | 'ends_at'>
type ActivityView = components['schemas']['ActivityTeacherView']

export function ActivityPageHeader({ activity, current, onEnded }: {
  activity: Activity
  current: 'live' | 'analysis'
  onEnded(): Promise<void> | void
}) {
  const { t, locale } = useT('teach')
  const detail = useResource<ActivityView>(`/activities/${activity.activity_id}`)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const questions = t('live.questions', { count: activity.question_count })
  const meta = activity.ends_at === null
    ? t('live.metaNoEnd', { questions })
    : t('live.meta', { questions, end: formatDateTime(activity.ends_at, locale, 'weekdayDateTime') })
  const canEnd = detail.data?.available_actions.includes('end_now') ?? false

  async function endActivity() {
    if (working) return
    setConfirmEnd(false)
    setWorking(true)
    setNotice(null)
    try {
      await api(`/activities/${activity.activity_id}/end_now`, 'POST')
      await Promise.all([detail.reload(), onEnded()])
    } catch (error) {
      setNotice(errorMessage(t, error))
    } finally {
      setWorking(false)
    }
  }

  return <>
    <header className="teach-head teacher-live__head">
      <div className="teach-head__title">
        <nav className="teach-head__crumb" aria-label={t('live.breadcrumbLabel')}>
          <Link to={`/teach/courses/${activity.course_id}`}>{t('course.breadcrumb')}</Link>
          <span aria-hidden="true"> / </span>
          <span>{activity.course_name}</span>
        </nav>
        <div className="teacher-live__title-row">
          <h1>{activity.title}</h1>
          <span className={`status-pill status-pill--${activity.status}`}>{t(`status.${activity.status}`)}</span>
        </div>
        <span className="teach-head__meta">{meta}</span>
      </div>
      <div className="teacher-live__actions">
        <Link className="button button--quiet" to={`/teach/activities/${activity.activity_id}/projector`}>{t('live.qr')}</Link>
        {canEnd && <button type="button" className="button button--dark" disabled={working} onClick={() => setConfirmEnd(true)}>{t('live.endEarly')}</button>}
      </div>
    </header>

    <nav className="teach-tabs" aria-label={t('live.tabsLabel')}>
      <Link to={`/teach/activities/${activity.activity_id}`} aria-current={current === 'live' ? 'page' : undefined}>{t('live.tabs.live')}</Link>
      <Link to={`/teach/activities/${activity.activity_id}/analysis`} aria-current={current === 'analysis' ? 'page' : undefined}>{t('live.tabs.analysis')}</Link>
    </nav>

    {notice && <p role="alert" className="form-error">{notice}</p>}

    {confirmEnd && <Dialog
      title={t('live.endDialog.title')}
      onClose={() => setConfirmEnd(false)}
      footer={<>
        <button type="button" className="button button--quiet" onClick={() => setConfirmEnd(false)}>{t('live.endDialog.cancel')}</button>
        <button type="button" className="button button--primary" onClick={() => void endActivity()}>{t('live.endDialog.confirm')}</button>
      </>}
    ><p className="dialog__text">{t('live.endDialog.body', { title: activity.title })}</p></Dialog>}
  </>
}
