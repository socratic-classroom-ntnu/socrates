import { formatDateTime } from '../../../i18n/format'
import type { Locale } from '../../../i18n/locale'

/** The part of useT's t that these helpers need: a key and its values. */
export type Translate = (key: string, values?: Record<string, unknown>) => string

const DAY = 24 * 60 * 60 * 1000

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Calendar days between two moments in the browser's time zone (DST-safe). */
function daysBetween(then: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(then)) / DAY)
}

function shortDate(date: Date, now: Date, locale: Locale): string {
  const sameYear = date.getFullYear() === now.getFullYear()
  return new Intl.DateTimeFormat(locale, sameYear
    ? { month: 'numeric', day: 'numeric' }
    : { year: 'numeric', month: 'numeric', day: 'numeric' }).format(date)
}

/** P13: 今天 10:31 · 昨天 21:40 · N 天前 (2–6) · M/D (a week or more; with the year once it differs). */
export function formatLastActivity(seconds: number | null, now: Date, t: Translate, locale: Locale): string {
  if (seconds === null) return t('students.none')
  const then = new Date(seconds * 1000)
  const days = daysBetween(then, now)
  const time = formatDateTime(seconds, locale, 'time')
  if (days <= 0) return t('students.today', { time })
  if (days === 1) return t('students.yesterday', { time })
  if (days < 7) return t('students.daysAgo', { count: days })
  return shortDate(then, now, locale)
}

export function formatJoined(seconds: number, now: Date, locale: Locale): string {
  return shortDate(new Date(seconds * 1000), now, locale)
}

type Named = { display_name: string; kind: 'registered' | 'guest' | 'expired_guest' | 'deleted' }

/** P15: a registered student's first visible character (a whole emoji sequence), a guest's 訪. */
export function avatarInitial(student: Named, t: Translate): string {
  if (student.kind === 'deleted') return '?'
  if (student.kind !== 'registered') return t('students.avatarGuest')
  const name = student.display_name.trim()
  if (!name) return '?'
  const [first] = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(name)
  return first.segment.toUpperCase()
}

export const AVATAR_TONES = 6

/** A tone fixed per enrollment (Fizzy 11/16: per course, not across courses). */
export function avatarTone(enrollmentId: string): number {
  let hash = 0
  for (const char of enrollmentId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % AVATAR_TONES
}

/** P11: the shown name (過期訪客 N for an expired guest) or the email, ignoring case. */
export function matchesSearch(shownName: string, email: string | null, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return shownName.toLowerCase().includes(needle) || (email ?? '').toLowerCase().includes(needle)
}

/** 1-based from–to of a page; an empty list is page 1 of 1 showing nothing. */
export function pageRange(page: number, total: number, size: number): { from: number; to: number; pages: number } {
  const pages = Math.max(1, Math.ceil(total / size))
  if (total === 0) return { from: 0, to: 0, pages }
  return { from: (page - 1) * size + 1, to: Math.min(page * size, total), pages }
}

/** P14: after the list shrinks (a removal), stay on the last page that still has rows. */
export function clampPage(page: number, total: number, size: number): number {
  return Math.min(Math.max(1, page), Math.max(1, Math.ceil(total / size)))
}
