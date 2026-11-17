import zhTeach from '../../../i18n/locales/zh-Hant/teach'
import { avatarInitial, avatarTone, clampPage, formatJoined, formatLastActivity, matchesSearch, pageRange } from './rosterFormat'

// 直接讀 zh-Hant 字典的小 t：rosterFormat 只用到 key 查找與 {{name}} 代入
const t = (key: string, values: Record<string, unknown> = {}) => {
  const found = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], zhTeach)
  if (typeof found !== 'string') throw new Error('missing key ' + key)
  return found.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values[name]))
}
const seconds = (date: Date) => date.getTime() / 1000
// 瀏覽器時區的 2026/11/16 14:00
const now = new Date(2026, 10, 16, 14, 0)

describe('formatLastActivity (P13)', () => {
  test('no activity yet is a dash (P7)', () => {
    expect(formatLastActivity(null, now, t, 'zh-Hant')).toBe('—')
  })
  test('today and yesterday show the time', () => {
    expect(formatLastActivity(seconds(new Date(2026, 10, 16, 10, 31)), now, t, 'zh-Hant')).toBe('今天 10:31')
    expect(formatLastActivity(seconds(new Date(2026, 10, 16, 0, 0)), now, t, 'zh-Hant')).toBe('今天 00:00')
    expect(formatLastActivity(seconds(new Date(2026, 10, 15, 23, 59)), now, t, 'zh-Hant')).toBe('昨天 23:59')
    expect(formatLastActivity(seconds(new Date(2026, 10, 15, 0, 5)), now, t, 'zh-Hant')).toBe('昨天 00:05')
  })
  test('two to six days ago count days', () => {
    expect(formatLastActivity(seconds(new Date(2026, 10, 14, 23, 0)), now, t, 'zh-Hant')).toBe('2 天前')
    expect(formatLastActivity(seconds(new Date(2026, 10, 10, 9, 0)), now, t, 'zh-Hant')).toBe('6 天前')
  })
  test('a week or more shows the date, with the year once it differs', () => {
    expect(formatLastActivity(seconds(new Date(2026, 10, 9, 9, 0)), now, t, 'zh-Hant')).toBe('11/9')
    expect(formatLastActivity(seconds(new Date(2025, 11, 31, 9, 0)), now, t, 'zh-Hant')).toBe('2025/12/31')
  })
  test('a clock slightly ahead of the browser still reads as today', () => {
    expect(formatLastActivity(seconds(new Date(2026, 10, 16, 14, 1)), now, t, 'zh-Hant')).toBe('今天 14:01')
  })
})

describe('formatJoined', () => {
  test('month/day this year, with the year otherwise', () => {
    expect(formatJoined(seconds(new Date(2026, 8, 15, 8, 0)), now, 'zh-Hant')).toBe('9/15')
    expect(formatJoined(seconds(new Date(2025, 8, 15, 8, 0)), now, 'zh-Hant')).toBe('2025/9/15')
  })
})

describe('avatar (P15)', () => {
  const registered = { display_name: '陳柏翰', kind: 'registered' as const }
  test('a registered student shows the first visible character', () => {
    expect(avatarInitial(registered, t)).toBe('陳')
    expect(avatarInitial({ ...registered, display_name: 'mei' }, t)).toBe('M')
    expect(avatarInitial({ ...registered, display_name: '👩‍🔬小美' }, t)).toBe('👩‍🔬')
    expect(avatarInitial({ ...registered, display_name: '  ' }, t)).toBe('?')
  })
  test('guests and expired guests show 訪', () => {
    expect(avatarInitial({ display_name: '安靜的貓頭鷹', kind: 'guest' }, t)).toBe('訪')
    expect(avatarInitial({ display_name: '', kind: 'expired_guest' }, t)).toBe('訪')
  })
  test('the tone is fixed per enrollment', () => {
    expect(avatarTone('e-1')).toBe(avatarTone('e-1'))
    const tones = new Set(['e-1', 'e-2', 'e-3', 'e-4', 'e-5', 'e-6', 'e-7', 'e-8'].map(avatarTone))
    expect(tones.size).toBeGreaterThan(1)
    for (const tone of tones) expect(tone).toBeGreaterThanOrEqual(0)
  })
})

describe('matchesSearch (P11)', () => {
  test('matches the shown name or the email, ignoring case and spaces around the query', () => {
    expect(matchesSearch('陳柏翰', 'pohan.chen@example.edu', '柏翰')).toBe(true)
    expect(matchesSearch('陳柏翰', 'pohan.chen@example.edu', ' POHAN ')).toBe(true)
    expect(matchesSearch('陳柏翰', null, 'example')).toBe(false)
    expect(matchesSearch('過期訪客 2', null, '過期訪客 2')).toBe(true)
    expect(matchesSearch('陳柏翰', null, '')).toBe(true)
  })
})

describe('paging (P5, P14)', () => {
  test('pageRange gives the 1-based from–to of a page', () => {
    expect(pageRange(1, 35, 8)).toEqual({ from: 1, to: 8, pages: 5 })
    expect(pageRange(5, 35, 8)).toEqual({ from: 33, to: 35, pages: 5 })
    expect(pageRange(1, 0, 8)).toEqual({ from: 0, to: 0, pages: 1 })
  })
  test('clampPage keeps the page inside the list after it shrinks', () => {
    expect(clampPage(2, 8, 8)).toBe(1)
    expect(clampPage(2, 9, 8)).toBe(2)
    expect(clampPage(3, 0, 8)).toBe(1)
  })
})
