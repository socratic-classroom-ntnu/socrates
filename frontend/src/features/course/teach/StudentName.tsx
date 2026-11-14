import type { components } from '../../../contract/classroomTypes'
import { useT } from '../../../i18n/useT'

type Student = Pick<components['schemas']['SoloStudentProgressView'], 'display_name' | 'kind' | 'guest_number'>

/** A student's name in teacher views; guests get a tag, and an expired guest (name cleared) shows a numbered placeholder. */
export function StudentName({ student }: { student: Student }) {
  const { t } = useT('teach')
  if (student.kind === 'registered') return <>{student.display_name}</>
  const name = student.kind === 'expired_guest' ? t('guest.anonymous', { number: student.guest_number ?? '' }) : student.display_name
  return <span className="student-name">
    <span>{name}</span>
    <span className="student-name__guest">{t('guest.tag')}</span>
  </span>
}
