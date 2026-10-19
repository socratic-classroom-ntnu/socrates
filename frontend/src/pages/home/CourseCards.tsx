import { Link } from 'react-router-dom'
import type { components } from '../../api/classroomTypes'
import { CopyButton } from '../../components/CopyButton'
import { formatDateTime } from '../../i18n/format'
import { useT } from '../../i18n/useT'

type Teaching = components['schemas']['CourseTeachingCard']
type Learning = components['schemas']['CourseLearningCard']

const BOOK = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2zM22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z" /></svg>
const CHEVRON = <span className="course-card__chevron" aria-hidden="true">›</span>

/** H1 我教的課: whole card opens the course; on phones it leads to S4m. Phones show no code (H1m-t). */
export function TeachingCard({ course, phone }: { course: Teaching; phone: boolean }) {
  const { t } = useT('home')
  const live = course.open_activity_count > 0 && <span className="status-pill status-pill--open">{t('teaching.live')}</span>
  if (phone) return <article className="course-card course-card--phone">
    <Link className="course-card__whole" to={`/teach/courses/${course.id}`}>
      <span className="course-card__body">
        <span className="course-card__head">{BOOK}<span className="course-card__name">{course.name}</span>{live}</span>
        <span className="course-card__meta">{t('teaching.counts', { students: t('teaching.students', { count: course.student_count }), activities: t('teaching.activities', { count: course.activity_count }) })}</span>
      </span>
      {CHEVRON}
    </Link>
  </article>
  return <article className="course-card">
    <div className="course-card__head">
      {BOOK}
      <h3><Link className="course-card__stretch" to={`/teach/courses/${course.id}`}>{course.name}</Link></h3>
      {live}
    </div>
    <div className="course-card__stats"><span>{t('teaching.students', { count: course.student_count })}</span><span>{t('teaching.activities', { count: course.activity_count })}</span></div>
    {course.code_enabled && <div className="course-card__code">
      <span>#{course.code}</span>
      <CopyButton text={course.code} label={t('teaching.copyCode')} iconOnly className="icon-button icon-button--quiet" />
    </div>}
  </article>
}

/** H1 我學的課: computers get a 「開始」 button for an open activity; phones make the whole card a link. */
export function LearningCard({ course, phone }: { course: Learning; phone: boolean }) {
  const { t, locale } = useT('home')
  const h = course.highlight
  const pill = course.open_activity_count > 0
    ? <span className="status-pill status-pill--open">{course.open_activity_count > 1 ? t('learning.openCount', { count: course.open_activity_count }) : t('learning.open')}</span>
    : <span className="status-pill status-pill--quiet">{phone ? t('learning.phoneNone') : t('learning.none')}</span>

  let title = t('learning.nothing')
  let detail = ''
  if (h?.status === 'open') {
    title = h.title
    detail = phone
      ? t('learning.phoneOpenMeta', { end: formatDateTime(h.ends_at, locale, 'date') })
      : t('learning.openMeta', { questions: t('learning.questions', { count: h.question_count }), end: formatDateTime(h.ends_at, locale, 'weekdayDateTime') })
  } else if (h?.status === 'scheduled') {
    title = t('learning.next', { title: h.title })
    detail = t('learning.opensAt', { start: formatDateTime(h.starts_at, locale, phone ? 'weekdayDateTime' : 'dateTime') })
  } else if (h?.status === 'ended') {
    title = t('learning.last', { title: h.title })
    detail = t('learning.endedAt', { end: formatDateTime(h.ends_at, locale, 'date') })
  }

  const body = <>
    <span className="course-card__activity">{title}</span>
    {detail && <span className="course-card__meta">{detail}</span>}
  </>

  if (phone) return <article className={'course-card course-card--phone' + (h?.status === 'open' ? ' course-card--active' : '')}>
    <Link className="course-card__whole" to={`/learn/courses/${course.id}`}>
      <span className="course-card__body">
        <span className="course-card__head"><span className="course-card__name">{course.name}</span>{pill}</span>
        {body}
      </span>
      {CHEVRON}
    </Link>
  </article>

  return <article className={'course-card' + (h?.status === 'open' ? ' course-card--active' : '')}>
    <div className="course-card__head">
      <h3><Link className="course-card__title-link" to={`/learn/courses/${course.id}`}>{course.name}</Link></h3>
      {pill}
    </div>
    <div className="course-card__content">{body}</div>
    {h?.status === 'open' && <div className="course-card__actions">
      <Link className="button button--primary" to={`/learn/activities/${h.id}`}>{t('learning.start')}<span aria-hidden="true">→</span></Link>
    </div>}
  </article>
}
