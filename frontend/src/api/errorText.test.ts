import { PASSWORD_RULE, errorText, fieldErrors } from './errorText'

test('known backend codes read as Chinese sentences', () => {
  expect(errorText('GROUP_CAPACITY_REQUIRED', 409)).toContain('分組容量不夠')
  expect(errorText('ORIGIN_BINDING_REQUIRED', 403)).toBe('請從正式網址開啟本網站後再試。')
  expect(errorText('API_ROUTE_JSON_REQUIRED', 500)).toBe('伺服器暫時無法處理這個請求，請稍後再試。')
  expect(errorText('COURSE_CODE_NOT_FOUND', 404)).toBe('找不到這個課程代碼，請確認後再輸入。')
})

test('sentences from the server pass through; unknown codes keep the code for reporting', () => {
  expect(errorText('請貼上 YAML 內容。', 422)).toBe('請貼上 YAML 內容。')
  expect(errorText('SOME_NEW_CODE', 409)).toBe('操作沒有完成（代碼 SOME_NEW_CODE）。')
})

test('provider HTTP codes and bare statuses get readable text', () => {
  expect(errorText('PROVIDER_HTTP_401', 424)).toBe('AI 服務拒絕了這組 API 金鑰，請確認金鑰是否正確。')
  expect(errorText('PROVIDER_EMPTY_CONTENT', 422)).toContain('沒有回傳內容')
  expect(errorText('PROVIDER_SCHEMA_MISMATCH', 422)).toContain('支援結構化輸出的模型')
  expect(errorText(undefined, 424)).toContain('AI 服務目前無法完成')
  expect(errorText(undefined, 422)).toBe('有欄位內容不符合格式，請檢查後再試。')
  expect(errorText([{ loc: ['body'], msg: 'x' }], 503)).toBe('伺服器暫時無法處理，請稍後再試。')
})

// FastAPI 422 的 detail 陣列要轉成針對欄位的中文，而不是籠統的「有欄位內容不符合格式」
test('a 422 validation array becomes field-specific Chinese', () => {
  const detail = [
    { type: 'string_too_short', loc: ['body', 'username'], msg: 'x', ctx: { min_length: 3 } },
    { type: 'value_error', loc: ['body', 'email'], msg: 'Value error, 請填入可收信的 email' },
    { type: 'string_too_long', loc: ['body', 'password'], msg: 'x', ctx: { max_length: 256 } },
  ]
  expect(fieldErrors(detail)).toEqual([
    { field: 'username', text: '使用者名稱至少要 3 個字元，請重新輸入。' },
    { field: 'email', text: 'Email 格式不正確，請重新輸入。' },
    { field: 'password', text: '密碼最多 256 個字元，請重新輸入。' },
  ])
  expect(errorText([{ type: 'value_error', loc: ['body', 'email'] }], 422)).toBe('Email 格式不正確，請重新輸入。')
  expect(errorText([{ type: 'string_pattern_mismatch', loc: ['body', 'username'] }], 422)).toContain('要以英文字母開頭')
  expect(errorText([{ type: 'password_policy', loc: ['body', 'password'] }], 422)).toBe(PASSWORD_RULE)
  expect(errorText([{ type: 'missing', loc: ['body', 'password'] }], 422)).toBe('請填寫密碼。')
  expect(errorText([{ type: 'string_too_short', loc: ['body', 'email'], ctx: { min_length: 3 } }], 422)).toBe('Email 格式不正確，請重新輸入。')
  // 認不得的欄位維持通用說明
  expect(errorText([{ type: 'missing', loc: ['body', 'other'] }], 422)).toBe('有欄位內容不符合格式，請檢查後再試。')
})

test('register conflicts read as distinct Chinese sentences', () => {
  expect(errorText('USERNAME_TAKEN', 409)).toBe('這個使用者名稱已經有人使用，請換一個。')
  expect(errorText('EMAIL_TAKEN', 409)).toContain('這個 Email 已經註冊過了')
  const pending = errorText('ACCOUNT_PENDING_VERIFICATION', 409)
  expect(pending).toContain('重新寄送驗證信')
  expect(pending).toContain('驗證連結過期')
})
