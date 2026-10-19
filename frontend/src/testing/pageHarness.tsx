// 測試用：在 MemoryRouter＋AuthProvider 裡開一頁，並用「METHOD path」對照表回應 api()。
// 每個測試檔仍要自己 jest.mock('../api/classroomClient')（jest.mock 只對所在檔案生效）。
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { api } from '../api/classroomClient'
import { AuthProvider } from '../app/AuthContext'
import { RequireAuth } from '../app/RequireAuth'

export const signedIn = {
  id: 'u-1', username: 'Fizzy', email: 'fizzy@example.org', email_masked: 'f***@example.org',
  verified: true, authority_state: 'FULL_PRODUCT', csrf_token: 'c', points: 0, achievements: [], locale: 'zh-Hant',
}

type Handler = unknown | ((body: Record<string, unknown> | undefined) => unknown)
export type ApiRoutes = Record<string, Handler>

/** Unknown requests throw, so a test notices a call it did not expect. */
export function mockApi(routes: ApiRoutes) {
  const calls: { key: string; body: unknown }[] = []
  jest.mocked(api).mockImplementation(async (path: string, method = 'GET', body?: Record<string, unknown>) => {
    const key = `${method} ${path}`
    calls.push({ key, body })
    if (key === 'GET /auth/me' && !(key in routes)) return signedIn
    if (!(key in routes)) throw new Error('unexpected request ' + key)
    const handler = routes[key]
    return typeof handler === 'function' ? await (handler as (b: unknown) => unknown)(body) : handler
  })
  return calls
}

export function Where() {
  const { pathname, search, hash, state } = useLocation()
  // 不用 <output>：它的隱含角色是 status，會和頁面上的提示混在一起
  return <div data-testid="where" data-state={state ? JSON.stringify(state) : ''}>{pathname + search + hash}</div>
}

/** Render `element` at `path` (a route pattern) after navigating to `url`. */
export function renderAt(url: string | { pathname: string; search?: string; state?: unknown }, path: string, element: ReactNode, extra: ReactNode = null) {
  return render(<MemoryRouter initialEntries={[url]}>
    <AuthProvider>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path={path} element={element} />
          {extra}
        </Route>
        <Route path="*" element={<p>other-page</p>} />
      </Routes>
      <Where />
    </AuthProvider>
  </MemoryRouter>)
}
