// 任何請求收到這兩個代碼，代表這個分頁的身分已經不在了（訪客過期、session 失效）。
// API client 在這裡通知，AuthContext 重新讀 /auth/me；變成未登入後由 RequireAuth 帶著目前網址導到登入頁。
export const SESSION_LOST_CODES = new Set(['GUEST_EXPIRED', 'LOGIN_REQUIRED'])

const listeners = new Set<() => void>()

export function onSessionLost(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** /auth/me itself answers LOGIN_REQUIRED when signed out; that is how the re-read ends, not a new loss. */
export function reportSessionLost(code: unknown, path: string): void {
  if (typeof code !== 'string' || !SESSION_LOST_CODES.has(code)) return
  if (/\/auth\/me(\?|$)/.test(path)) return
  listeners.forEach(listener => listener())
}
