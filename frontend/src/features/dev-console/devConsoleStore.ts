import { useEffect } from 'react'

// 開發控制台讀取「目前畫面」資料的地方：頁面把自己已經拿到的資料放進來，控制台訂閱。
// 只是模組內的變數，不掛在 window 上、不另外打 API；控制台沒打開時沒有任何訂閱者。

type Listener = () => void
let views: Readonly<Record<string, unknown>> = {}
let account: unknown = null
const listeners = new Set<Listener>()
const notify = () => listeners.forEach(listener => listener())

export function subscribeDevConsole(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** 目前掛載中的教室畫面原始資料，鍵是來源名稱（例如「教室 RoomView」）。 */
export function devViews(): Readonly<Record<string, unknown>> {
  return views
}

export function devAccount(): unknown {
  return account
}

export function publishDevView(source: string, data: unknown) {
  views = { ...views, [source]: data }
  notify()
}

export function clearDevView(source: string) {
  if (!(source in views)) return
  const { [source]: _removed, ...rest } = views
  void _removed
  views = rest
  notify()
}

export function publishDevAccount(value: unknown) {
  account = value
  notify()
}

/** 頁面用：資料變動時更新，卸載時移除。 */
export function useDevView(source: string, data: unknown) {
  useEffect(() => { if (data !== null && data !== undefined) publishDevView(source, data) }, [source, data])
  useEffect(() => () => clearDevView(source), [source])
}
