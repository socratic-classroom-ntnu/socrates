import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError, api } from '../../../api/classroomClient'
import { useResource } from '../../../api/useResource'
import { useShellBack } from '../../../app/shellContext'
import { errorMessage } from '../../../i18n/errors'
import { formatDateTime } from '../../../i18n/format'
import { useT } from '../../../i18n/useT'
import '../../../styles/solo.css'
import type { SoloActivityView } from './soloView'

export function SoloActivityPage() {
  const { t, locale } = useT('solo')
  const { activityId = '' } = useParams()
  const navigate = useNavigate()
  const activity = useResource<SoloActivityView>(`/solo/activities/${activityId}`)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<unknown>(null)
  useShellBack(activity.data ? `/learn/courses/${activity.data.course_id}` : '/', t('activity.back'))

  if (activity.loading && !activity.data) return <main className="solo-activity" aria-busy="true" />
  if (!activity.data) {
    const notFound = activity.error instanceof ApiError && activity.error.status === 404
    return <main className="solo-activity solo-activity--message">
      <h1>{notFound ? t('activity.notFound') : errorMessage(t, activity.error)}</h1>
      <Link className="button button--outline" to="/">{t('activity.home')}</Link>
    </main>
  }

  const data = activity.data
  const brief = data.attempt
  const rows = brief
    ? brief.progress.map(question => ({
      status: question.status,
      label: question.title
        ? t('activity.questionTitle', { number: question.index + 1, title: question.title })
        : t('activity.questionNumber', { number: question.index + 1 }),
      note: question.status === 'confirmed'
        ? t('activity.confirmed', { option: question.option_label ?? '' })
        : question.status === 'in_dialogue' ? t('activity.inDialogue') : t('activity.notStarted'),
    }))
    : Array.from({ length: data.question_count }, (_, index) => ({
      status: 'not_started' as const,
      label: t('activity.questionNumber', { number: index + 1 }),
      note: t('activity.notStarted'),
    }))
  const reviewing = brief?.review_status === 'in_progress'

  async function start() {
    if (data.attempt) {
      navigate(`/learn/activities/${activityId}/dialogue`)
      return
    }
    setStarting(true)
    setStartError(null)
    try {
      await api(`/solo/activities/${activityId}/attempt`, 'POST')
      navigate(`/learn/activities/${activityId}/dialogue`)
    } catch (error) {
      setStartError(error)
    } finally {
      setStarting(false)
    }
  }

  return <main className="solo-activity">
    <header className="solo-activity__head">
      <nav className="solo-activity__crumb" aria-label={t('activity.breadcrumbLabel')}>
        <Link to="/?tab=learn">{t('activity.back')}</Link><span aria-hidden="true">/</span>
        <Link to={`/learn/courses/${data.course_id}`}>{data.course_name}</Link>
      </nav>
      <div className="solo-activity__title">
        <Link className="solo-activity__back" to={`/learn/courses/${data.course_id}`} aria-label={t('activity.backToCourse')} title={t('activity.backToCourse')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </Link>
        <h1>{data.title}</h1>
      </div>
    </header>
    <div className="solo-activity__panel">
      <div className="solo-activity__main">
        <dl className="solo-activity__facts">
          <div><dt>{t('activity.status')}</dt><dd><span className={`solo-activity__status solo-activity__status--${data.status}`}>{t(`activity.statuses.${data.status}`)}</span></dd></div>
          <div><dt>{t('activity.questions')}</dt><dd>{t('activity.questionCount', { count: data.question_count })}</dd></div>
          <div><dt>{t('activity.openUntil')}</dt><dd>{formatDateTime(data.ends_at, locale, 'weekdayDateTime')}</dd></div>
        </dl>
        <section className="solo-activity__progress" aria-labelledby="solo-activity-progress">
          <h2 id="solo-activity-progress">{t('activity.progress')}</h2>
          <ol>
            {rows.map((row, index) => <li key={index} className={`solo-activity__step solo-activity__step--${row.status}`}>
              <span className="solo-activity__number" aria-hidden="true">{index + 1}</span>
              <span className="solo-activity__step-label">{row.label}</span>
              <span className="solo-activity__step-note">{row.note}</span>
            </li>)}
            <li className={`solo-activity__step solo-activity__step--${reviewing ? 'in_dialogue' : 'not_started'}`}>
              <span className="solo-activity__number" aria-hidden="true">{rows.length + 1}</span>
              <span className="solo-activity__step-label">{t('activity.review')}</span>
              <span className="solo-activity__step-note">{reviewing ? t('activity.inProgress') : t('activity.notStarted')}</span>
            </li>
          </ol>
        </section>
        <p className="solo-activity__hint">{t('activity.progressHint')}</p>
      </div>
      <aside className="solo-activity__card">
        {!brief && <>
          <span className="solo-activity__card-label">{t('activity.notStarted')}</span>
          <b>{t('activity.startTitle')}</b>
          <p>{t('activity.startBody')}</p>
        </>}
        {brief && (reviewing
          ? <b>{t('activity.reviewNext')}</b>
          : <>
            <span className="solo-activity__card-label">{t('activity.lastStop')}</span>
            {/* current_turn is the question's turn_index, and the stance itself is turn 0. */}
            <b>{t('activity.resumeAt', { number: brief.question_index + 1, turn: brief.current_turn + 1 })}</b>
          </>)}
        {(brief || data.status === 'open')
          ? <button className="solo-activity__cta" type="button" disabled={starting} onClick={start}>
            {brief ? t('activity.continue') : t('activity.start')}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
          : <p className="solo-activity__closed">{t('activity.closed')}</p>}
        {startError && <p role="alert">{errorMessage(t, startError, 'solo')}</p>}
        <small>{t('activity.saved')}</small>
      </aside>
    </div>
  </main>
}
