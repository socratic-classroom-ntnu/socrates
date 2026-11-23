import type { components } from '../../../../contract/classroomTypes'
import type { Stage } from './transcriptModel'

export type T = (key: string, options?: Record<string, unknown>) => string
type Student = components['schemas']['TeacherStudentView']

/** The name the live page shows: an expired guest has none left, so the page's own numbered placeholder. */
export function studentName(t: T, student: Pick<Student, 'display_name' | 'kind' | 'guest_number'>): string {
  return student.kind === 'expired_guest' ? t('guest.expired', { number: student.guest_number ?? '' }) : student.display_name
}

export function firstChar(name: string): string {
  return Array.from(name.trim())[0] ?? ''
}

/** Where the student is, with the live page's own words and styles (`live.cells.*`, `live.review.*`). */
export function stageLabel(t: T, stage: Stage): { className: string; label: string } {
  if (stage.kind === 'review') return { className: 'live-cell live-cell--review', label: t(`live.review.${stage.key}`) }
  const label = {
    confirmed: t('live.cells.confirmed'),
    in_dialogue: t('live.cells.inDialogue', { count: stage.turns ?? 0 }),
    confirming: t('live.cells.confirming'),
    capped: t('live.cells.capped'),
    answering: t('live.cells.answering'),
  }[stage.status]
  return { className: `live-cell live-cell--${stage.status}`, label }
}
