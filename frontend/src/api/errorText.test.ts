import { errorText } from './errorText'

test('known backend codes read as Chinese sentences', () => {
  expect(errorText('GROUP_CAPACITY_REQUIRED', 409)).toContain('分組容量不夠')
  expect(errorText('ORIGIN_BINDING_REQUIRED', 403)).toBe('請從正式網址開啟本網站後再試。')
  expect(errorText('API_ROUTE_JSON_REQUIRED', 500)).toBe('伺服器暫時無法處理這個請求，請稍後再試。')
})

test('sentences from the server pass through; unknown codes keep the code for reporting', () => {
  expect(errorText('請貼上 YAML 內容。', 422)).toBe('請貼上 YAML 內容。')
  expect(errorText('SOME_NEW_CODE', 409)).toBe('操作沒有完成（代碼 SOME_NEW_CODE）。')
})

test('provider HTTP codes and bare statuses get readable text', () => {
  expect(errorText('PROVIDER_HTTP_401', 502)).toBe('AI 服務拒絕了這組 API 金鑰，請確認金鑰是否正確。')
  expect(errorText(undefined, 422)).toBe('有欄位內容不符合格式，請檢查後再試。')
  expect(errorText([{ loc: ['body'], msg: 'x' }], 503)).toBe('伺服器暫時無法處理，請稍後再試。')
})
