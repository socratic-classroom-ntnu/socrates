import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { DevConsole } from './DevConsole'
import { publishDevAccount, publishDevView, clearDevView } from './devConsoleStore'
import { api } from '../../api/classroomClient'

type Reply = { status?: number; body: unknown }
function serve(routes: Record<string, Reply>) {
  const fetchMock = jest.fn(async (url: string) => {
    const reply = routes[url] ?? { status: 404, body: { detail: 'Not Found' } }
    const status = reply.status ?? 200
    return { ok: status < 400, status, headers: { get: () => 'application/json' }, json: async () => reply.body }
  })
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}
const urls = (fetchMock: jest.Mock) => fetchMock.mock.calls.map(([url]) => url)
const release = { status: 200, body: { release_id: 'socrates-abc', source_sha: 'abc1234def', environment: 'stage', alembic_revision: 'head', built_at: 'x' } }

afterEach(() => {
  publishDevAccount(null)
  clearDevView('教室畫面')
})

test.each([
  ['false', { debug_mode: false }],
  ['absent', { search_scope: 'sites' }],
])('debug_mode %s renders nothing and asks for nothing else', async (_label, config) => {
  const fetchMock = serve({ '/api/v2/public-config': { body: config }, '/api/release': release })
  const { container } = render(<DevConsole/>)
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  await act(async () => { await Promise.resolve() })
  expect(container).toBeEmptyDOMElement()
  expect(urls(fetchMock)).toEqual(['/api/v2/public-config'])
})

test('debug_mode true shows the toggle; the drawer lists every section with real data', async () => {
  serve({ '/api/v2/public-config': { body: { debug_mode: true } }, '/api/release': release })
  window.history.replaceState({}, '', '/classrooms/c1?mode=teacher')
  publishDevAccount({ id: 'acc-1', username: 'goose', verified: true, csrf_token: 'secret-token' })
  publishDevView('教室畫面', { id: 'c1', phase: 'arena' })
  render(<DevConsole/>)

  fireEvent.click(await screen.findByRole('button', { name: '開發控制台' }))
  const drawer = screen.getByRole('dialog', { name: '開發控制台（只在開發模式出現）' })
  for (const name of ['版本', '目前登入帳號', '目前頁面路由與 query', /最近的 API 錯誤/, '目前教室畫面原始資料']) {
    expect(within(drawer).getByRole('heading', { name })).toBeInTheDocument()
  }
  expect(await within(drawer).findByText('abc1234def')).toBeInTheDocument()
  expect(within(drawer).getByText('stage')).toBeInTheDocument()
  expect(within(drawer).getByText('goose')).toBeInTheDocument()
  expect(drawer).not.toHaveTextContent('secret-token')
  expect(within(drawer).getByText('/classrooms/c1')).toBeInTheDocument()
  expect(within(drawer).getByText('?mode')).toBeInTheDocument()
  expect(within(drawer).getByLabelText('教室畫面 原始資料')).toHaveTextContent('"phase": "arena"')
  expect(within(drawer).getByText('功能待訂')).toBeInTheDocument()
  expect(within(drawer).getByRole('button', { name: '關閉開發控制台' })).toHaveFocus()
})

test('Esc closes the drawer and returns focus to the toggle; Tab stays inside', async () => {
  serve({ '/api/v2/public-config': { body: { debug_mode: true } }, '/api/release': release })
  publishDevView('教室畫面', { id: 'c1' }) // 讓抽屜裡除了關閉鍵還有一個可聚焦的 summary
  render(<DevConsole/>)
  const toggle = await screen.findByRole('button', { name: '開發控制台' })
  fireEvent.click(toggle)
  const drawer = screen.getByRole('dialog')
  const close = within(drawer).getByRole('button', { name: '關閉開發控制台' })
  const summary = within(drawer).getByText('教室畫面')
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
  expect(summary).toHaveFocus() // 從第一個往回跳到最後一個，不離開抽屜
  fireEvent.keyDown(summary, { key: 'Tab' })
  expect(close).toHaveFocus()
  fireEvent.keyDown(drawer, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(toggle).toHaveFocus()
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
})

test('a failed API call shows up in the recent error list', async () => {
  serve({
    '/api/v2/public-config': { body: { debug_mode: true } },
    '/api/release': release,
    '/api/v2/classrooms/c9/commands': { status: 409, body: { detail: 'ACTION_ID_PAYLOAD_CONFLICT' } },
  })
  await expect(api('/classrooms/c9/commands', 'POST', {})).rejects.toMatchObject({ status: 409 })
  render(<DevConsole/>)
  fireEvent.click(await screen.findByRole('button', { name: '開發控制台' }))
  const list = screen.getByRole('list', { name: '最近的 API 錯誤列表' })
  const latest = within(list).getAllByRole('listitem')[0]
  expect(latest).toHaveTextContent('409')
  expect(latest).toHaveTextContent('POST /api/v2/classrooms/c9/commands')
  expect(latest).toHaveTextContent('ACTION_ID_PAYLOAD_CONFLICT')
})
