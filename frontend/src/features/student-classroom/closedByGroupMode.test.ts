import { closedByGroupMode } from './socketClose'

// 伺服器以 4403 關掉連線就不再重連（後台 spec P27）；其他斷線照舊退避重連
test('only a 4403 close stops reconnecting', () => {
  expect(closedByGroupMode(4403)).toBe(true)
  expect(closedByGroupMode(1006)).toBe(false)
  expect(closedByGroupMode(4401)).toBe(false)
  expect(closedByGroupMode(undefined)).toBe(false)
})
