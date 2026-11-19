import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { components } from '../../../contract/classroomTypes'
import { useResource } from '../../../contract/useResource'
import { errorMessage } from '../../../i18n/errors'
import { useT } from '../../../i18n/useT'
import { Chip, FormError } from '../../../ui'
import '../../../styles/teach.css'
import '../../../styles/teacher-live.css'
import { ActivityPageHeader } from './ActivityPageHeader'
import { StudentName } from './StudentName'

type ProgressView = components['schemas']['SoloActivityProgressView']
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
  const { t } = useT('teach')
  const progress = useResource<ProgressView>(activityId ? `/solo/activities/${activityId}/progress` : null)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    const timer = window.setInterval(() => { void progress.reload() }, 10_000)
    return () => window.clearInterval(timer)
  }, [progress.reload])

  if (progress.loading && !progress.data) return <div aria-busy="true" />
  if (!progress.data) return <main className="teach-page teach-page--message"><FormError role="alert">{errorMessage(t, progress.error)}</FormError></main>

  const view = progress.data
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

  // The same name the row shows: an expired guest has none stored, so the page's own placeholder.
  function nameOf(student: Student) {
    return student.kind === 'expired_guest' ? t('guest.expired', { number: student.guest_number ?? '' }) : student.display_name
  }

  function cellLabel(cell: Cell) {
    if (cell.status === 'confirmed') return t('live.cells.confirmed')
    if (cell.status === 'in_dialogue') return t('live.cells.inDialogue', { count: cell.turns ?? 0 })
    if (cell.status === 'confirming') return t('live.cells.confirming')
    if (cell.status === 'capped') return t('live.cells.capped')
    return t('live.cells.answering')
  }

  // One cell per scenario a student has reached; the table is as wide as the furthest student.
  const scenarioCount = Math.max(1, ...view.students.map(student => student.cells.length))
  const scenarios = Array.from({ length: scenarioCount }, (_, index) => index)

  return <main className="teach-page teacher-live" data-testid="teacher-live-page">
    <ActivityPageHeader activity={view} current="live" onEnded={progress.reload} />

    <section className="live-summaries" aria-label={t('live.tabs.live')}>
      <article className="live-summary-card">
        <p>{t('live.startedSummary', { started: view.summary.started, enrolled: view.summary.enrolled })}</p>
      </article>
      <article className="live-summary-card">
        <p>{t('live.doneSummary', { count: view.summary.done })}</p>
      </article>
      <article className="live-summary-card live-summary-card--attention">
        <span aria-hidden="true">!</span>
        <p>{t('live.attentionSummary', { count: view.summary.attention })}</p>
      </article>
    </section>

    <section className="live-roster">
      <div className="live-roster__filters" role="group" aria-label={t('live.filterLabel')}>
        {filterKeys.map(key => <Chip key={key} pressed={filter === key} onClick={() => setFilter(key)}>
          {t(`live.filters.${key}`)} {counts[key]}
        </Chip>)}
      </div>
      <div className="live-table-wrap">
        <table className="live-table">
          <thead><tr>
            <th scope="col">{t('live.table.student')}</th>
            {scenarios.map(index => <th scope="col" key={index}>{t('live.table.scenario', { number: index + 1 })}</th>)}
            <th scope="col">{t('live.table.review')}</th>
            <th scope="col">{t('live.table.lastActivity')}</th>
            <th scope="col" className="live-table__view">{t('live.table.view')}</th>
          </tr></thead>
          <tbody>
            {shown.map(student => <tr key={student.enrollment_id} className={student.attention ? 'live-table__attention' : undefined}>
              <th scope="row"><StudentName student={student} /></th>
              {scenarios.map(index => {
                const cell = student.cells[index]
                return <td key={index}>{cell
                  ? <span className={`live-cell live-cell--${cell.status}`}>{cellLabel(cell)}</span>
                  : <span className="live-cell live-cell--not_started">{t('live.cells.notStarted')}</span>}</td>
              })}
              <td><span className="live-cell live-cell--review">{t(`live.review.${reviewKey(student)}`)}</span></td>
              <td>{lastActivity(student)}</td>
              <td className="live-table__view">{student.overall === 'not_started'
                // Nothing to read before the student starts: a struck-through eye, not a link.
                ? <span className="live-view live-view--off" role="img" aria-label={t('live.view.unavailable')} data-tip={t('live.view.unavailable')}><EyeIcon off /></span>
                : <Link className="live-view" to={`/teach/activities/${view.activity_id}/students/${student.enrollment_id}`} aria-label={t('live.view.openFor', { name: nameOf(student) })} data-tip={t('live.view.open')}><EyeIcon /></Link>}</td>
            </tr>)}
            {shown.length === 0 && <tr><td colSpan={scenarios.length + 4} className="live-table__empty">{t('live.empty')}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>

    <footer className="teacher-live__footer">
      <span>{t('live.updating')}</span>
      <span>{t('live.privacy')}</span>
    </footer>

  </main>
}

/** The review column: a completed review says whether its final summary was confirmed. */
function reviewKey(student: { review_status: string; final_status: string | null }): string {
  if (student.review_status === 'completed') return student.final_status === 'unconfirmed' ? 'unconfirmed' : 'completed'
  return student.review_status === 'in_progress' ? 'inProgress' : 'notStarted'
}

/** The eye of the 檢視 column (Figma 884-15695); struck through when there is nothing to view. */
function EyeIcon({ off = false }: { off?: boolean }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="M4 4l16 16" />}
  </svg>
}
