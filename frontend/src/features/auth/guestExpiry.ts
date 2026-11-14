import type { Locale } from '../../i18n/locale'

/** 「紀錄保留到 ○/○」: the expiry date only, in the browser's time zone; the expiry day itself is the last day. */
export function guestKeepUntil(expiresAt: number, locale: Locale, now: Date = new Date()): { date: string; lastDay: boolean } {
  const end = new Date(expiresAt * 1000)
  const date = new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' }).format(end)
  const sameDay = end.getFullYear() === now.getFullYear() && end.getMonth() === now.getMonth() && end.getDate() === now.getDate()
  return { date, lastDay: sameDay || end.getTime() <= now.getTime() }
}
