import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/classroomClient'
import type { components } from '../../api/classroomTypes'
import { useResource } from '../../api/useResource'
import { useShellBack } from '../../app/shellContext'
import { useIsPhone } from '../../app/useIsPhone'
import { CopyButton } from '../../components/CopyButton'
import { errorMessage } from '../../i18n/errors'
import { formatDateTime } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import '../../styles/learn.css'

type Course = components['schemas']['CourseStudentView']
type List = components['schemas']['ActivityStudentList']
type Card = components['schemas']['ActivityStudentCard']
type Status = Card['status']
type Filter = 'all' | Status
const SECTIONS: Status[] = ['open', 'scheduled', 'ended']
const isFilter = (value: string | null): value is Filter => value === 'all' || SECTIONS.includes(value as Status)

/** C1／C1m: the student's view of one course. Progress-based wording waits for M3. */
export function StudentCoursePage() {
  const { t, locale } = useT('learn')
  const { courseId = '' } = useParams()
  const phone = useIsPhone()
  const course = useResource<Course>(`/courses/${courseId}?role=student`)
  const list = useResource<List>(`/courses/${courseId}/activities?role=student`)
  const [params, setParams] = useSearchParams()
  const raw = params.get('filter')
  const filter: Filter = isFilter(raw) ? raw : 'all'
  useShellBack('/?tab=learn', t('breadcrumb'))

  if ((course.loading && !course.data) || (list.loading && !list.data)) return <main className="learn-page" aria-busy="true" />
  if (!course.data || !list.data) {
    const error = course.error ?? list.error
    const notFound = error instanceof ApiError && error.status === 404
    return <main className="learn-page learn-page--message">
      <h1>{notFound ? t('notFound.title') : errorMessage(t, error)}</h1>
      {notFound && <p>{t('notFound.body')}</p>}
      <Link className="button button--outline" to="/">{t('notFound.back')}</Link>
    </main>
  }

  const data = course.data
  const items = list.data.items
  const date = (seconds: number, style: Parameters<typeof formatDateTime>[2]) => formatDateTime(seconds, locale, style)
  const count = (key: Filter) => key === 'all' ? items.length : items.filter(item => item.status === key).length
  const shown = SECTIONS.filter(status => filter === 'all' || filter === status)
    .map(status => [status, items.filter(item => item.status === status)] as const)
    .filter(([, cards]) => cards.length > 0)

  function openCard(card: Card) {
    const questions = t('questions', { count: card.question_count })
    if (phone) return <article key={card.id} className="learn-card learn-card--open">
      <Link className="learn-card__whole" to={`/learn/activities/${card.id}`}>
        <span className="learn-card__body"><span className="learn-card__title">{card.title}</span>
          <span className="learn-card__meta">{t('phoneOpen', { questions, end: date(card.ends_at, 'date') })}</span></span>
        <span className="learn-card__chevron" aria-hidden="true">›</span>
      </Link>
    </article>
    return <article key={card.id} className="learn-card learn-card--open">
      <h3 className="learn-card__title">{card.title}</h3>
      <div className="learn-card__content">
        <span className="learn-card__strong">{questions}</span>
        <span className="learn-card__meta">{t('openUntil', { end: date(card.ends_at, 'weekdayDateTime') })}</span>
      </div>
      <Link className="button button--outline learn-card__start" to={`/learn/activities/${card.id}`}>{t('start')}<span aria-hidden="true">→</span></Link>
    </article>
  }

  return <main className="learn-page">
    <header className="learn-head">
      <div className="learn-head__title">
        {!phone && <Link className="learn-head__crumb" to="/?tab=learn">{t('breadcrumb')}</Link>}
        <h1>{data.name}</h1>
        <span className="learn-head__meta">{t('teacher', { name: data.teacher_name })}</span>
      </div>
      {/* C1m 手機稿沒有代碼框 */}
      {data.code && !phone && <div className="learn-head__code">
        <span>{t('code')}</span><strong>{data.code}</strong>
        <CopyButton text={data.code} label={t('copyCode')} iconOnly className="icon-button icon-button--quiet" />
      </div>}
    </header>
    {items.length === 0 ? <p className="learn-empty">{t('nothing')}</p> : <>
      <div role="group" aria-label={t('filterLabel')} className="chips">
        {(['all', ...SECTIONS] as Filter[]).map(key => <button key={key} type="button" className="chip" aria-pressed={filter === key}
          onClick={() => setParams(key === 'all' ? {} : { filter: key }, { replace: true })}>{t(`filters.${key}`)} {count(key)}</button>)}
      </div>
      {shown.length === 0 && <p className="learn-empty">{t('noMatch')}</p>}
      {shown.map(([status, cards]) => <section key={status} className={`learn-section learn-section--${status}`} aria-labelledby={`learn-${status}`}>
        <h2 id={`learn-${status}`}>{t(`sections.${status}`)}</h2>
        {status === 'open' && <div className="learn-grid">{cards.map(openCard)}</div>}
        {status === 'scheduled' && <div className="learn-list">{cards.map(card => <article key={card.id} className="learn-card learn-card--scheduled">
          <h3 className="learn-card__title">{card.title}</h3>
          <span className="learn-card__meta">{t('opensAt', { start: date(card.starts_at, 'dateTime') })}</span>
        </article>)}</div>}
        {status === 'ended' && <ul className="learn-ended">{cards.map(card => <li key={card.id}>
          <span className="learn-card__title">{card.title}</span>
          <span className="learn-card__meta">{t('endedAt', { end: date(card.ends_at, 'date') })}</span>
        </li>)}</ul>}
      </section>)}
    </>}
  </main>
}
