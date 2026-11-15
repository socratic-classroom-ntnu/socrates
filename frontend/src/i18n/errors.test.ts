import { ApiError } from '../contract/classroomClient'
import { errorMessage } from './errors'
import i18n from '.'

const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options)

// 錯誤碼有自己的句子時，句子優先；HTTP 狀態只是沒有句子時的退路（我的對話的每日上限是 429）
describe('errorMessage', () => {
  test('a code with its own sentence wins over the 429 fallback', () => {
    expect(errorMessage(t, new ApiError(429, 'PRACTICE_DAILY_LIMIT'))).toBe('今天的新對話次數用完了，明天再來。之前的對話可以繼續。')
  })

  test('a plain 429 still reads as too many requests', () => {
    expect(errorMessage(t, new ApiError(429, 'RATE_LIMITED'))).toBe(i18n.t('common:errors.RATE_LIMITED'))
    expect(errorMessage(t, new ApiError(429, 'SOMETHING_ELSE'))).toBe(i18n.t('common:errors.RATE_LIMITED'))
  })

  test.each([
    ['PRACTICE_UNAVAILABLE', 503, '練習暫時無法使用，請稍後再試。'],
    ['PRACTICE_TOPIC_NOT_FOUND', 404, '找不到這個題目，請重新整理後再選一次。'],
  ])('%s has its own sentence', (code, status, text) => {
    expect(errorMessage(t, new ApiError(status, code))).toBe(text)
  })
})
