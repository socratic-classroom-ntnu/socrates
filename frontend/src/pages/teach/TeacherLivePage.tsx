import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../api/classroomClient'
import type { components } from '../../api/classroomTypes'
import { useResource } from '../../api/useResource'
import { Dialog } from '../../components/Dialog'
import { errorMessage } from '../../i18n/errors'
import { formatDateTime } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import '../../styles/teach.css'
import '../../styles/teacher-live.css'

type ProgressView = components['schemas']['SoloActivityProgressView']
type ActivityView = components['schemas']['ActivityTeacherView']
type Student = components['schemas']['SoloStudentProgressView']
type Cell = components['schemas']['SoloProgressCellView']
type Filter = 'all' | 'inProgress' | 'attention' | 'done' | 'notStarted'

const FILTERS: Record<Filter, (student: Student) => boolean> = {
  all: () => true,
  inProgress: student => student.overall === 'in_progress',
  attention: student => student.attention,
  done: student => student.overall === 'done',
  notStarted: student => student.overall === 'not_started',
}

const filterKeys = Object.keys(FILTERS) as Filter[]

/** T5: teacher-only aggregate progress. The API deliberately contains no dialogue text. */
export function TeacherLivePage() {
  const { activityId } = useParams()
  const { t, locale } = useT('teach')
  const progress = useResource<ProgressView>(activityId ? `/solo/activities/${activityId}/progress` : null)
  const activity = useResource<ActivityView>(activityId ? `/activities/${activityId}` : null)
  const [filter, setFilter] = useState<Filter>('all')
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => { void progress.reload() }, 10_000)
    return () => window.clearInterval(timer)
  }, [progress.reload])

  if ((progress.loading && !progress.data) || (activity.loading && !activity.data)) return <div aria-busy="true" />
  if (!progress.data) return <main className="teach-page teach-page--message"><p role="alert" className="form-error">{errorMessage(t, progress.error)}</p></main>

  const view = progress.data
  const questions = t('live.questions', { count: view.question_count })
  const meta = view.ends_at === null
    ? t('live.metaNoEnd', { questions })
    : t('live.meta', { questions, end: formatDateTime(view.ends_at, locale, 'weekdayDateTime') })
  const canEnd = activity.data?.available_actions.includes('end_now') ?? false
  const shown = view.students.filter(FILTERS[filter])
  const counts = Object.fromEntries(filterKeys.map(key => [key, view.students.filter(FILTERS[key]).length])) as Record<Filter, number>

  function minutesSince(at: number | null): number | null {
    return at === null ? null : Math.max(0, Math.floor((view.generated_at - at) / 60))
  }

  function lastActivity(student: Student) {
    const minutes = minutesSince(student.last_activity_at)
    if (minutes === null) return <span>{t('live.time.none')}</span>
    return <span className="live-time">
      <span>{minutes < 1 ? t('live.time.now') : t('live.time.minutes', { count: minutes })}</span>
      {student.attention && <span className="live-time__attention">{t('live.time.attention', { count: minutes })}</span>}
    </span>
  }

  function cellLabel(cell: Cell) {
    if (cell.status === 'confirmed') return t('live.cells.confirmed')
    if (cell.status === 'in_dialogue') return t('live.cells.inDialogue', { count: cell.turns ?? 0 })
    if (cell.status === 'confirming') return t('live.cells.confirming')
    return t('live.cells.notStarted')
  }

  async function endActivity() {
    if (!activityId || working) return
    setConfirmEnd(false)
    setWorking(true)
    setNotice(null)
    try {
      await api(`/activities/${activityId}/end_now`, 'POST')
      await Promise.all([activity.reload(), progress.reload()])
    } catch (error) {
      setNotice(errorMessage(t, error))
    } finally {
      setWorking(false)
    }
  }

  return <main className="teach-page teacher-live" data-testid="teacher-live-page">
    <header className="teach-head teacher-live__head">
      <div className="teach-head__title">
        <nav className="teach-head__crumb" aria-label={t('live.breadcrumbLabel')}>
          <Link to={`/teach/courses/${view.course_id}`}>{t('course.breadcrumb')}</Link>
          <span aria-hidden="true"> / </span>
          <span>{view.course_name}</span>
        </nav>
        <div className="teacher-live__title-row">
          <h1>{view.title}</h1>
          <span className={`status-pill status-pill--${view.status}`}>{t(`status.${view.status}`)}</span>
        </div>
        <span className="teach-head__meta">{meta}</span>
      </div>
      <div className="teacher-live__actions">
        <Link className="button button--quiet" to={`/teach/activities/${view.activity_id}/projector`}>{t('live.qr')}</Link>
        {canEnd && <button type="button" className="button button--dark" disabled={working} onClick={() => setConfirmEnd(true)}>{t('live.endEarly')}</button>}
      </div>
    </header>

    <nav className="teach-tabs" aria-label={t('live.tabsLabel')}>
      <Link to={`/teach/activities/${view.activity_id}`} aria-current="page">{t('live.tabs.live')}</Link>
      <Link to={`/teach/activities/${view.activity_id}/analysis`}>{t('live.tabs.analysis')}</Link>
    </nav>

    {notice && <p role="alert" className="form-error">{notice}</p>}

    <section className="live-summaries" aria-label={t('live.tabs.live')}>
      {/* unconfirmed counts students who have not reached the question yet, so the base is everyone who started */}
      {view.questions.map((question, position) => <article className="live-summary-card" key={question.index}>
        <h2>{question.title}</h2>
        <p>{t('live.questionSummary', { unconfirmed: view.summary.unconfirmed_by_question[position] ?? 0, started: view.summary.started })}</p>
      </article>)}
      <article className="live-summary-card live-summary-card--attention">
        <span aria-hidden="true">!</span>
        <p>{t('live.attentionSummary', { count: view.summary.attention })}</p>
      </article>
    </section>

    <section className="live-roster">
      <div className="live-roster__filters" role="group" aria-label={t('live.filterLabel')}>
        {filterKeys.map(key => <button key={key} type="button" className="chip" aria-pressed={filter === key} onClick={() => setFilter(key)}>
          {t(`live.filters.${key}`)} {counts[key]}
        </button>)}
      </div>
      <div className="live-table-wrap">
        <table className="live-table">
          <thead><tr>
            <th scope="col">{t('live.table.student')}</th>
            {view.questions.map(question => <th scope="col" key={question.index}>{question.title}</th>)}
            <th scope="col">{t('live.table.review')}</th>
            <th scope="col">{t('live.table.lastActivity')}</th>
          </tr></thead>
          <tbody>
            {shown.map(student => <tr key={student.enrollment_id} className={student.attention ? 'live-table__attention' : undefined}>
              <th scope="row">{student.display_name}</th>
              {view.questions.map((question, position) => {
                const cell = student.cells[position] ?? { status: 'not_started' as const, turns: null }
                return <td key={question.index}><span className={`live-cell live-cell--${cell.status}`}>{cellLabel(cell)}</span></td>
              })}
              <td><span className="live-cell live-cell--review">{t(`live.review.${student.review_status === 'in_progress' ? 'inProgress' : 'notStarted'}`)}</span></td>
              <td>{lastActivity(student)}</td>
            </tr>)}
            {shown.length === 0 && <tr><td colSpan={view.questions.length + 3} className="live-table__empty">{t('live.empty')}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>

    <footer className="teacher-live__footer">
      <span>{t('live.updating')}</span>
      <span>{t('live.privacy')}</span>
    </footer>

    {confirmEnd && <Dialog
      title={t('live.endDialog.title')}
      onClose={() => setConfirmEnd(false)}
      footer={<>
        <button type="button" className="button button--quiet" onClick={() => setConfirmEnd(false)}>{t('live.endDialog.cancel')}</button>
        <button type="button" className="button button--primary" onClick={() => void endActivity()}>{t('live.endDialog.confirm')}</button>
      </>}
    ><p className="dialog__text">{t('live.endDialog.body', { title: view.title })}</p></Dialog>}
  </main>
}
