import type { components } from '../../../contract/classroomTypes'
import { useT } from '../../../i18n/useT'

type Student = Pick<components['schemas']['SoloStudentProgressView'], 'display_name' | 'kind' | 'guest_number'>

/** A student's name in teacher views; guests get a tag, an expired guest (name cleared) shows a numbered placeholder,
 * and an account its owner deleted shows 已刪除的帳號 (no tag, no number). */
export function StudentName({ student }: { student: Student }) {
  const { t } = useT('teach')
  if (student.kind === 'registered') return <>{student.display_name}</>
  if (student.kind === 'deleted') return <>{t('guest.deleted')}</>
  const name = student.kind === 'expired_guest' ? t('guest.expired', { number: student.guest_number ?? '' }) : student.display_name
  return <span className="student-name">
    <span>{name}</span>
    <span className="student-name__guest">{t('guest.tag')}</span>
  </span>
}
