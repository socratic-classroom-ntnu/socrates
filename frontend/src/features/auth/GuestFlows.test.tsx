import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { ApiError, api } from '../../contract/classroomClient'
import { reportSessionLost } from '../../contract/sessionEvents'
import { AppRoutes } from '../../app/routes'
import { applyLocale } from '../../i18n'
import { AuthProvider } from './AuthContext'
import { TEACHER_MERGE_REFUSED } from './GuestAccountPages'
import { UPGRADED_KEY } from './GuestPanels'
import { guestKeepUntil } from './guestExpiry'

jest.mock('../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../contract/classroomClient')>('../../contract/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})
jest.mock('../classroom-stage/Arena', () => ({ Arena: () => null }))
jest.mock('../group-dialogue/GroupClassroom', () => ({ GroupClassroomGate: () => null }))
jest.mock('../ai-settings/ProviderSettings', () => ({ ProviderSettings: () => null }))
jest.mock('../course/learn/StudentCoursePage', () => ({ StudentCoursePage: () => <p>course-page</p> }))

const WEEK = 7 * 86400
const now = () => Math.floor(Date.now() / 1000)
const guest = (extra: Record<string, unknown> = {}) => ({
  id: 'g-1', username: '小-明-1a2b3c4d', display_name: '小-明', email: '', email_masked: '',
  verified: false, authority_state: 'EMAIL_VERIFICATION', csrf_token: 'csrf', points: 0, achievements: [],
  locale: 'zh-Hant', kind: 'guest', guest_expires_at: now() + WEEK, ...extra,
})
const registered = {
  id: 'u-1', username: 'ming', display_name: 'ming', email: 'ming@example.org', email_masked: 'm***@example.org',
  verified: true, authority_state: 'FULL_PRODUCT', csrf_token: 'csrf', points: 0, achievements: [],
  locale: 'zh-Hant', kind: 'registered', guest_expires_at: null,
}
const lists = { teaching: [], learning: [] }

type Routes = Record<string, unknown | ((body: unknown) => unknown)>

function serve(me: unknown | (() => unknown), routes: Routes = {}) {
  const calls: { key: string; body: unknown }[] = []
  jest.mocked(api).mockImplementation(async (url: string, method = 'GET', body?: unknown) => {
    const key = `${method} ${url}`
    calls.push({ key, body })
    if (key === 'GET /auth/me') return typeof me === 'function' ? (me as () => unknown)() : me
    if (key === 'GET /courses' && !(key in routes)) return lists
    if (key === 'GET /public-config') return {}
    if (!(key in routes)) throw new Error('unexpected request ' + key)
    const handler = routes[key]
    return typeof handler === 'function' ? (handler as (b: unknown) => unknown)(body) : handler
  })
  return calls
}

function openApp(url: string) {
  window.history.replaceState({}, '', url)
  render(<BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter>)
}

const where = () => window.location.pathname + window.location.search

beforeEach(async () => {
  jest.mocked(api).mockReset()
  localStorage.clear()
  await applyLocale('zh-Hant')
})

// ---- the keep-until date ------------------------------------------------------------------

test('the keep-until date is the expiry day, and that day is the last day', () => {
  const expires = new Date(2026, 10, 21, 9, 30)
  const seconds = expires.getTime() / 1000
  const label = new Intl.DateTimeFormat('zh-Hant', { month: 'numeric', day: 'numeric' }).format(expires)
  expect(guestKeepUntil(seconds, 'zh-Hant', new Date(2026, 10, 20, 23, 59))).toEqual({ date: label, lastDay: false })
  expect(guestKeepUntil(seconds, 'zh-Hant', new Date(2026, 10, 21, 0, 1))).toEqual({ date: label, lastDay: true })
  expect(guestKeepUntil(seconds, 'zh-Hant', new Date(2026, 10, 21, 23, 59)).lastDay).toBe(true)
})

// ---- a guest using the site ---------------------------------------------------------------

test('a guest reaches pages that ask for a verified email, and home shows the reminder card', async () => {
  serve(guest())
  openApp('/')
  expect(await screen.findByRole('heading', { name: '你目前是訪客' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('小-明')
  expect(screen.getByRole('link', { name: '註冊以保留紀錄' })).toHaveAttribute('href', '/guest/register')
  expect(where()).toBe('/')
})

test('on the last day the card says so (G13)', async () => {
  const end = new Date()
  end.setHours(23, 59, 0, 0)
  serve(guest({ guest_expires_at: Math.floor(end.getTime() / 1000) }))
  openApp('/')
  expect(await screen.findByRole('heading', { name: '今天是訪客紀錄的最後 1 天' })).toBeInTheDocument()
})

test('the account menu shows the nickname and the keep-until date, with register instead of settings (G14)', async () => {
  serve(guest())
  openApp('/')
  fireEvent.click(await screen.findByRole('button', { name: '帳號選單' }))
  const menu = await screen.findByRole('menu', { name: '帳號選單' })
  expect(within(menu).getByText(/訪客 · 紀錄保留到/)).toBeInTheDocument()
  expect(within(menu).getAllByText('小-明').length).toBeGreaterThan(0)
  expect(within(menu).queryByText('小-明-1a2b3c4d')).toBeNull()
  expect(within(menu).getByRole('menuitem', { name: '註冊以保留紀錄' })).toBeInTheDocument()
  expect(within(menu).queryByRole('menuitem', { name: '個人設定' })).toBeNull()
  expect(screen.queryByRole('link', { name: 'AI 連線設定' })).toBeNull()
})

async function openLogout() {
  fireEvent.click(await screen.findByRole('button', { name: '帳號選單' }))
  fireEvent.click(await screen.findByRole('menuitem', { name: '登出' }))
  return screen.findByRole('dialog', { name: '要登出訪客身分嗎？' })
}

test('a guest confirms before logging out: × keeps them, 仍要登出 ends the guest (G15)', async () => {
  const calls = serve(guest(), { 'POST /auth/logout': null })
  openApp('/')
  const dialog = await openLogout()
  fireEvent.click(within(dialog).getByRole('button', { name: '關閉' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(calls.some(call => call.key === 'POST /auth/logout')).toBe(false)
  const again = await openLogout()
  await act(async () => { fireEvent.click(within(again).getByRole('button', { name: '仍要登出' })) })
  await waitFor(() => expect(where()).toBe('/login'))
})

test('先註冊 in the logout dialog goes to registering', async () => {
  serve(guest())
  openApp('/')
  const dialog = await openLogout()
  fireEvent.click(within(dialog).getByRole('button', { name: '先註冊' }))
  await waitFor(() => expect(where()).toBe('/guest/register'))
})

test('GUEST_EXPIRED on any request reads the account again and sends the guest to login with the page', async () => {
  let expired = false
  serve(() => { if (expired) throw new ApiError(401, 'GUEST_EXPIRED'); return guest() })
  openApp('/learn/courses/c-1')
  expect(await screen.findByText('course-page')).toBeInTheDocument()
  expired = true
  await act(async () => { reportSessionLost('GUEST_EXPIRED', '/api/v2/courses/c-1') })
  await waitFor(() => expect(where()).toBe('/login?next=' + encodeURIComponent('/learn/courses/c-1')))
})

test('LOGIN_REQUIRED does the same, and the /auth/me read itself does not loop', async () => {
  let gone = false
  const calls = serve(() => { if (gone) throw new ApiError(401, 'LOGIN_REQUIRED'); return registered })
  openApp('/learn/courses/c-1')
  await screen.findByText('course-page')
  gone = true
  await act(async () => { reportSessionLost('LOGIN_REQUIRED', '/api/v2/courses/c-1') })
  await waitFor(() => expect(where()).toContain('/login?next='))
  await act(async () => { reportSessionLost('LOGIN_REQUIRED', '/api/v2/auth/me') })
  expect(calls.filter(call => call.key === 'GET /auth/me').length).toBe(2)
})

// ---- registering (G16–G19) ----------------------------------------------------------------

async function fillRegister(email = 'ming@example.org') {
  fireEvent.change(await screen.findByLabelText('使用者名稱'), { target: { value: 'ming' } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'Socratic-123' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^註冊/ })) })
}

test('registering keeps the guest records and goes to email verification first', async () => {
  const calls = serve(guest(), { 'POST /auth/guest/upgrade': { ...registered, verified: false } })
  openApp('/guest/register')
  expect(await screen.findByText('送出後要先完成 Email 驗證，才能繼續上課。')).toBeInTheDocument()
  await fillRegister()
  await waitFor(() => expect(window.location.pathname).toBe('/verify'))
  expect(calls).toContainEqual({ key: 'POST /auth/guest/upgrade', body: { username: 'ming', email: 'ming@example.org', password: 'Socratic-123' } })
  expect(localStorage.getItem(UPGRADED_KEY)).toBe('1')
})

test('field errors stay on the form (G17)', async () => {
  serve(guest())
  openApp('/guest/register')
  fireEvent.change(await screen.findByLabelText('使用者名稱'), { target: { value: 'm' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^註冊/ })) })
  expect(screen.getByLabelText('使用者名稱')).toHaveAttribute('aria-invalid', 'true')
})

test('an email already registered offers logging in with it to keep the records (G19 → G21)', async () => {
  serve(guest(), { 'POST /auth/guest/upgrade': () => { throw new ApiError(409, 'EMAIL_TAKEN') } })
  openApp('/guest/register')
  await fillRegister('used@example.org')
  const link = await screen.findByRole('link', { name: '登入並保留訪客紀錄' })
  fireEvent.click(link)
  await waitFor(() => expect(window.location.pathname).toBe('/guest/login'))
  expect(screen.getByLabelText('使用者名稱或 Email')).toHaveValue('used@example.org')
})

test('after verifying, home says the guest records were kept (G26), once', async () => {
  localStorage.setItem(UPGRADED_KEY, '1')
  serve(registered)
  openApp('/')
  expect(await screen.findByText('Email 驗證完成，訪客時的紀錄都保留下來了。')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '知道了' }))
  expect(localStorage.getItem(UPGRADED_KEY)).toBeNull()
})

// ---- logging in to merge (G20–G25) --------------------------------------------------------

async function logIn(password = 'Socratic-123') {
  fireEvent.change(await screen.findByLabelText('使用者名稱或 Email'), { target: { value: 'ming' } })
  fireEvent.change(screen.getByLabelText('密碼'), { target: { value: password } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '登入' })) })
}

test('logging in moves the guest records and home says so (G25)', async () => {
  let me: unknown = guest()
  serve(() => me, { 'POST /auth/login': () => { me = registered; return registered } })
  openApp('/guest/login')
  await logIn()
  expect(await screen.findByText('訪客的課程和對話已經併入你的帳號。')).toBeInTheDocument()
  expect(where()).toBe('/?merged=1')
})

test('a wrong password says so and stays (G22)', async () => {
  serve(guest(), { 'POST /auth/login': () => { throw new ApiError(401, 'AUTH_INVALID_CREDENTIALS') } })
  openApp('/guest/login')
  await logIn('wrong')
  expect(await screen.findByRole('alert')).toHaveTextContent('使用者名稱、Email 或密碼不正確。')
  expect(window.location.pathname).toBe('/guest/login')
})

test('a teacher account is refused with its own panel (G24, faked until 5a has the code)', async () => {
  serve(guest(), { 'POST /auth/login': () => { throw new ApiError(409, TEACHER_MERGE_REFUSED) } })
  openApp('/guest/login')
  await logIn()
  expect(await screen.findByText('老師帳號不能併入訪客紀錄')).toBeInTheDocument()
})

// ---- a guest scanning a course that does not take guests (G27, G28) -----------------------

const coursePreview = { course_id: 'c-2', name: '哲學', teacher_name: '王', already_enrolled: false, default_display_name: '小-明', open_activity_title: null, allow_guest: false }

test('a guest scanning a closed course sees G27, and registering keeps the way back', async () => {
  serve(guest(), { 'GET /course-join/preview?code=AB12': coursePreview })
  openApp('/join?code=AB12')
  expect(await screen.findByRole('heading', { name: '這門課不開放訪客加入' })).toBeInTheDocument()
  expect(screen.getByText(/你目前的課程與對話仍保留到/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '註冊' })).toHaveAttribute('href', '/guest/register?next=' + encodeURIComponent('/join?code=AB12'))
  expect(screen.getByRole('link', { name: '登入' })).toHaveAttribute('href', '/guest/login?next=' + encodeURIComponent('/join?code=AB12'))
})

test('a guest already in that course goes straight in', async () => {
  serve(guest(), { 'GET /course-join/preview?code=AB12': { ...coursePreview, already_enrolled: true } })
  openApp('/join?code=AB12')
  await waitFor(() => expect(where()).toBe('/learn/courses/c-2'))
})

test('a guest scanning an activity of a closed course sees G28', async () => {
  serve(guest(), {
    'GET /activities/a-9/join-preview': {
      activity_id: 'a-9', title: '電車', course_id: 'c-2', course_name: '哲學', teacher_name: '王', status: 'open',
      starts_at: now() - 60, ends_at: now() + 3600, already_enrolled: false, default_display_name: '小-明', allow_guest: false,
    },
  })
  openApp('/activities/a-9/join')
  expect(await screen.findByRole('heading', { name: '這個活動的課程不開放訪客加入' })).toBeInTheDocument()
})
