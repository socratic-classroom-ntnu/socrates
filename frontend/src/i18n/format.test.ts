import { formatDateTime, greetingKey } from './format'

const originalTZ = process.env.TZ
beforeAll(() => { process.env.TZ = 'Asia/Taipei' })
afterAll(() => { process.env.TZ = originalTZ })

// 2026-10-24 23:59 in Taipei (UTC+8), a Saturday.
const seconds = Date.UTC(2026, 9, 24, 15, 59) / 1000

test('zh-Hant weekday date time', () => {
  const text = formatDateTime(seconds, 'zh-Hant', 'weekdayDateTime')
  expect(text).toContain('10/24')
  expect(text).toContain('23:59')
  expect(text).toContain('六')
})

test('each style keeps its parts', () => {
  expect(formatDateTime(seconds, 'zh-Hant', 'date')).toContain('10/24')
  expect(formatDateTime(seconds, 'zh-Hant', 'date')).not.toContain('23:59')
  expect(formatDateTime(seconds, 'zh-Hant', 'time')).toBe('23:59')
  expect(formatDateTime(seconds, 'zh-Hant', 'dateTime')).toMatch(/10\/24.*23:59/)
})

test('english uses english month names', () => {
  expect(formatDateTime(seconds, 'en', 'weekdayDateTime')).toContain('Oct')
  expect(formatDateTime(seconds, 'es', 'weekdayDateTime')).toMatch(/oct/i)
})

test.each([
  [4, 59, 'evening'],
  [5, 0, 'morning'],
  [10, 59, 'morning'],
  [11, 0, 'afternoon'],
  [17, 59, 'afternoon'],
  [18, 0, 'evening'],
])('greeting at %i:%i is %s', (hour, minute, key) => {
  expect(greetingKey(new Date(2026, 9, 24, hour, minute))).toBe(key)
})

test('weekday date without time', () => {
  const zh = formatDateTime(seconds, 'zh-Hant', 'weekdayDate')
  expect(zh).toContain('10/24')
  expect(zh).toContain('（六）')
  expect(zh).not.toContain('23:59')
  expect(formatDateTime(seconds, 'en', 'weekdayDate')).toContain('Oct')
})
