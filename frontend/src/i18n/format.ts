import type { Locale } from './locale'

export type DateStyle = 'date' | 'weekdayDate' | 'time' | 'dateTime' | 'weekdayDateTime'

const OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  date: { month: 'numeric', day: 'numeric' },
  weekdayDate: { month: 'short', day: 'numeric', weekday: 'short' },
  time: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
  dateTime: { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
  weekdayDateTime: { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
}

// zh 的 month:'short' 會變成「10月」；設計稿寫「10/24（五）23:59」，所以中文自己組。
function chineseWeekdayDate(date: Date, locale: Locale): string {
  const day = new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' }).format(date)
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(date)
  return `${day}（${weekday}）`
}

function chineseWeekdayDateTime(date: Date, locale: Locale): string {
  return chineseWeekdayDate(date, locale) + new Intl.DateTimeFormat(locale, OPTIONS.time).format(date)
}

/** Backend times are Unix seconds; every page formats them through here, in the reader's locale. */
export function formatDateTime(seconds: number, locale: Locale, style: DateStyle): string {
  const date = new Date(seconds * 1000)
  if (style === 'weekdayDateTime' && locale.startsWith('zh')) return chineseWeekdayDateTime(date, locale)
  if (style === 'weekdayDate' && locale.startsWith('zh')) return chineseWeekdayDate(date, locale)
  return new Intl.DateTimeFormat(locale, OPTIONS[style]).format(date)
}

export function greetingKey(now: Date): 'morning' | 'afternoon' | 'evening' {
  const hour = now.getHours()
  if (hour >= 5 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 18) return 'afternoon'
  return 'evening'
}
