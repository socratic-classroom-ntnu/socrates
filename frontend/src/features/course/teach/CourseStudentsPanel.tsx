import { useState } from 'react'
import type { components } from '../../../contract/classroomTypes'
import { useResource } from '../../../contract/useResource'
import { Menu } from '../../../components/Menu'
import { errorMessage } from '../../../i18n/errors'
import { useT } from '../../../i18n/useT'
import { Button, iconButtonClass } from '../../../ui'
import { RemoveStudentDialog } from './RemoveStudentDialog'
import { StudentName } from './StudentName'
import {
  avatarInitial, avatarTone, clampPage, formatJoined, formatLastActivity, matchesSearch, pageRange, type Translate,
} from './rosterFormat'
import styles from './CourseStudentsPanel.module.css'
import '../../../styles/teacher-live.css'

type Roster = components['schemas']['SoloCourseRosterView']
type Student = Roster['students'][number]

const PAGE_SIZE = 8

/** T4s 學生名單: the server's order (newest 最近活動 first), searched and paged here (P5, P11, P14). */
export function CourseStudentsPanel({ courseId, onChanged }: { courseId: string; onChanged(): void }) {
  const { t, locale } = useT('teach')
  const translate = t as unknown as Translate
  const roster = useResource<Roster>(`/solo/courses/${courseId}/students`)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [removing, setRemoving] = useState<Student | null>(null)

  if (roster.loading && !roster.data) return <section className={styles.panel} aria-busy="true" />
  if (!roster.data) return <section className={styles.panel}><p role="alert">{errorMessage(t, roster.error)}</p></section>

  const data = roster.data
  if (data.summary.total === 0) return <section className={styles.panel}><p className={styles.empty}>{t('students.empty')}</p></section>

  const now = new Date(data.generated_at * 1000)
  const shownName = (student: Student) => student.kind === 'expired_guest'
    ? t('guest.expired', { number: student.guest_number ?? '' })
    : student.kind === 'deleted' ? t('guest.deleted') : student.display_name
  const matched = data.students.filter(student => matchesSearch(shownName(student), student.email, query))
  const current = clampPage(page, matched.length, PAGE_SIZE)
  const range = pageRange(current, matched.length, PAGE_SIZE)
  const visible = matched.slice(range.from === 0 ? 0 : range.from - 1, range.to)
  const { summary } = data

  const footer = [
    t('students.summary', { total: summary.total, registered: summary.registered, guests: summary.guests, expired: summary.expired_guests }),
    ...(summary.deleted > 0 ? [t('students.deleted', { count: summary.deleted })] : []),
    ...(query.trim() ? [t('students.matched', { count: matched.length })] : []),
    ...(matched.length > 0 ? [t('students.range', { from: range.from, to: range.to })] : []),
  ].join(t('students.separator'))

  return <section className={styles.panel}>
    <div className={styles.toolbar}>
      <input
        type="search"
        className={styles.search}
        aria-label={t('students.searchLabel')}
        placeholder={t('students.searchPlaceholder')}
        value={query}
        onChange={event => { setQuery(event.target.value); setPage(1) }}
      />
    </div>
    <div className={styles.tableWrap}>
      <table className={styles.table} aria-label={t('students.tableLabel')}>
        <thead>
          <tr>
            <th scope="col">{t('students.columns.name')}</th>
            <th scope="col">{t('students.columns.email')}</th>
            <th scope="col">{t('students.columns.joined')}</th>
            <th scope="col">{t('students.columns.lastActivity')}</th>
            <th scope="col">{t('students.columns.progress')}</th>
            <th scope="col"><span className={styles.visuallyHidden}>{t('students.remove')}</span></th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && <tr><td colSpan={6} className={styles.noMatch}>{t('students.noMatch')}</td></tr>}
          {visible.map(student => <tr key={student.enrollment_id}>
            <td>
              <span className={styles.name}>
                <span
                  className={`${styles.avatar} ${student.kind === 'registered' ? styles[`tone${avatarTone(student.enrollment_id)}`] : styles.guestAvatar}`}
                  aria-hidden="true"
                >{avatarInitial(student, translate)}</span>
                <span className={styles.nameText}><StudentName student={student} /></span>
              </span>
            </td>
            <td className={styles.muted}>{student.email ?? t('students.none')}</td>
            <td>{formatJoined(student.joined_at, now, locale)}</td>
            <td>{formatLastActivity(student.last_activity_at, now, translate, locale)}</td>
            <td><Progress done={student.completed_activities} total={data.counted_activities} t={translate} /></td>
            <td className={styles.actions}>
              <Menu
                label={t('students.more', { name: shownName(student) })}
                trigger={<span aria-hidden="true">⋮</span>}
                items={[{ key: 'remove', label: t('students.remove'), danger: true, onSelect: () => setRemoving(student) }]}
                align="end"
                triggerClassName={iconButtonClass('quiet')}
              />
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <div className={styles.footer}>
      <p data-testid="roster-footer">{footer}</p>
      <nav className={styles.pager} aria-label={t('students.paging')}>
        <Button variant="outline" disabled={current <= 1 || matched.length === 0} onClick={() => setPage(current - 1)}>{t('students.previous')}</Button>
        <Button variant="outline" disabled={current >= range.pages || matched.length === 0} onClick={() => setPage(current + 1)}>{t('students.next')}</Button>
      </nav>
    </div>
    {removing && <RemoveStudentDialog
      courseId={courseId}
      enrollmentId={removing.enrollment_id}
      name={shownName(removing)}
      onCancel={() => setRemoving(null)}
      onRemoved={() => {
        setRemoving(null)
        void roster.reload()
        onChanged()
      }}
    />}
  </section>
}

function Progress({ done, total, t }: { done: number; total: number; t: Translate }) {
  if (total === 0) return <span>{t('students.none')}</span>
  return <span className={styles.progress}>
    <span className={styles.progressText}>{t('students.progress', { done, total })}</span>
    <span
      className={styles.bar}
      role="progressbar"
      aria-valuemin={0}
      aria-valuenow={done}
      aria-valuemax={total}
      aria-label={t('students.progressLabel', { done, total })}
    >
      <span className={styles.barFill} style={{ width: `${Math.min(100, (done / total) * 100)}%` }} />
    </span>
  </span>
}
