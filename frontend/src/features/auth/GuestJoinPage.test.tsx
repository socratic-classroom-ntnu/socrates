import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { ApiError, api } from '../../contract/classroomClient'
import { AppRoutes } from '../../app/routes'
import { applyLocale } from '../../i18n'
import { AuthProvider } from './AuthContext'
import { GUEST_WORDS, guestName, nameLength } from './guestNames'

jest.mock('../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../contract/classroomClient')>('../../contract/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})
jest.mock('../classroom-stage/Arena', () => ({ Arena: () => null }))
jest.mock('../group-dialogue/GroupClassroom', () => ({ GroupClassroomGate: () => null }))
jest.mock('../ai-settings/ProviderSettings', () => ({ ProviderSettings: () => null }))
jest.mock('../course/learn/StudentCoursePage', () => ({ StudentCoursePage: () => <p>course-page</p> }))
jest.mock('../solo-activity/SoloActivityPage', () => ({ SoloActivityPage: () => <p>activity-page</p> }))

const guest = {
  id: 'g-1', username: '安靜的貓頭鷹-1a2b3c4d', display_name: '安靜的貓頭鷹', email: '', email_masked: '',
  verified: false, authority_state: 'EMAIL_VERIFICATION', csrf_token: 'csrf', points: 0, achievements: [],
  locale: 'zh-Hant', kind: 'guest', account_role: 'student', guest_expires_at: 2_000_000_000,
}
const courseJoined = { account: guest, course_id: 'c-1', activity_id: null, activity_status: null }

type Routes = Record<string, unknown | ((body: unknown) => unknown)>

/** Signed out; `routes` answer by "METHOD url". */
function anonymous(routes: Routes) {
  const calls: { key: string; body: unknown }[] = []
  jest.mocked(api).mockImplementation(async (url: string, method = 'GET', body?: unknown) => {
    const key = `${method} ${url}`
    calls.push({ key, body })
    if (url === '/auth/me') throw new ApiError(401, 'LOGIN_REQUIRED')
    if (key in routes) {
      const handler = routes[key]
      return typeof handler === 'function' ? (handler as (b: unknown) => unknown)(body) : handler
    }
    return []
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
  await applyLocale('zh-Hant')
})

// ---- J0 -----------------------------------------------------------------------------------

test('J0 puts 登入並加入課程 first, then 不想註冊？, then 免註冊加入 (方案 C)', async () => {
  anonymous({ 'GET /course-join/public-preview?code=AB12': { course_name: '哲學導論', allow_guest: true } })
  openApp('/login?next=' + encodeURIComponent('/join?code=AB12'))
  const guestLink = await screen.findByRole('link', { name: /免註冊加入/ })
  expect(guestLink).toHaveAttribute('href', '/join/guest?next=' + encodeURIComponent('/join?code=AB12'))
  const login = screen.getByRole('button', { name: '登入並加入課程' })
  // Fields first, the outlined login, the divider, then the solid guest button (design 01).
  const divider = screen.getByText('不想註冊？')
  expect(screen.getByLabelText('密碼').compareDocumentPosition(login) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(login.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(divider.compareDocumentPosition(guestLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getByText('第一次來？不必填 Email，也能開始。')).toBeInTheDocument()
})

test.each([
  ['a course that does not allow guests', '/join?code=AB12', { 'GET /course-join/public-preview?code=AB12': { course_name: '哲學導論', allow_guest: false } }, '登入以加入課程', '這門課需要登入或註冊學生帳號才能加入'],
  ['an activity of a course that does not allow guests', '/activities/a-1/join', { 'GET /activities/a-1/public-preview': { course_name: '哲學導論', allow_guest: false, status: 'open' } }, '登入以加入活動', '這個活動的課程需要登入或註冊學生帳號才能加入'],
])('J0 is login only with the G06 notice for %s', async (_, next, routes, heading, notice) => {
  anonymous(routes)
  openApp('/login?next=' + encodeURIComponent(next))
  expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
  expect(screen.getByText(notice)).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /免註冊加入/ })).toBeNull()
  expect(screen.queryByText('不想註冊？')).toBeNull()
})

test.each([
  ['an activity that has ended', '/activities/a-1/join', { 'GET /activities/a-1/public-preview': { course_name: '哲學導論', allow_guest: true, status: 'ended' } }],
  ['a preview that cannot be read', '/join?code=AB12', { 'GET /course-join/public-preview?code=AB12': () => { throw new ApiError(429, 'RATE_LIMITED') } }],
])('J0 is login only, without a claim about the course, for %s', async (_, next, routes) => {
  anonymous(routes)
  openApp('/login?next=' + encodeURIComponent(next))
  expect(await screen.findByRole('heading', { name: /^加入(課程|活動)$/ })).toBeInTheDocument()
  await act(async () => { await Promise.resolve() })
  expect(screen.queryByRole('link', { name: /免註冊加入/ })).toBeNull()
  expect(screen.queryByText(/需要登入或註冊/)).toBeNull()
})

// ---- the name page ------------------------------------------------------------------------

function openNamePage(next = '/join?code=AB12', routes: Routes = {}) {
  const calls = anonymous({ 'GET /course-join/public-preview?code=AB12': { course_name: '哲學導論', allow_guest: true }, ...routes })
  openApp('/join/guest?next=' + encodeURIComponent(next))
  return calls
}

test('the banner on the name page says joining, not logging in', async () => {
  openNamePage()
  const banner = await screen.findByText('由課程 QR Code 進入')
  expect(banner.closest('[role=status]')).toHaveTextContent('正在加入：哲學導論')
})

test('the name is pre-filled from the word lists and 換一個 picks another', async () => {
  openNamePage()
  const input = await screen.findByLabelText('訪客名字') as HTMLInputElement
  const first = input.value
  const words = GUEST_WORDS['zh-Hant']
  expect(words.adjectives.some(word => first.startsWith(word)) && words.nouns.some(word => first.endsWith(word))).toBe(true)
  const seen = new Set([first])
  for (let i = 0; i < 10; i += 1) {
    fireEvent.click(screen.getByRole('button', { name: '換一個' }))
    seen.add(input.value)
  }
  expect(seen.size).toBeGreaterThan(1)
})

test('every locale has at least 20 adjectives and 20 nouns', () => {
  for (const words of Object.values(GUEST_WORDS)) {
    expect(new Set(words.adjectives).size).toBeGreaterThanOrEqual(20)
    expect(new Set(words.nouns).size).toBeGreaterThanOrEqual(20)
  }
  expect(guestName('en', () => 0)).toBe('Quiet Owl')
})

test('switching the language changes the page at once', async () => {
  openNamePage()
  await screen.findByRole('heading', { name: '免註冊加入' })
  await act(async () => { fireEvent.change(screen.getByLabelText('使用語言'), { target: { value: 'en' } }) })
  expect(await screen.findByLabelText('Guest name')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Join without an account' })).toBeInTheDocument()
  await act(async () => { await applyLocale('zh-Hant') })
})

test('a blank name (G08) and one over 40 characters (G09) are stopped before sending', async () => {
  const calls = openNamePage()
  const input = await screen.findByLabelText('訪客名字')
  fireEvent.change(input, { target: { value: '   ' } })
  fireEvent.click(screen.getByRole('button', { name: /^加入/ }))
  expect(await screen.findByText('請輸入名字（1～40 字）')).toBeInTheDocument()
  fireEvent.change(input, { target: { value: '字'.repeat(41) } })
  fireEvent.click(screen.getByRole('button', { name: /^加入/ }))
  expect(await screen.findByText('名字最多 40 字，請縮短後再加入')).toBeInTheDocument()
  expect(screen.getByText(/訪客名字 · 41\/40/)).toBeInTheDocument()
  expect(calls.some(call => call.key === 'POST /course-join/guest')).toBe(false)
})

test('an emoji counts as one character, as the backend counts it', () => {
  expect(nameLength('貓🦉')).toBe(2)
  expect(nameLength('  🦉'.repeat(1))).toBe(1)
})

test('joining a course goes straight to the course page with the chosen name and language', async () => {
  const calls = openNamePage('/join?code=AB12', { 'POST /course-join/guest': courseJoined })
  const input = await screen.findByLabelText('訪客名字')
  fireEvent.change(input, { target: { value: '  小明  ' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^加入/ })) })
  await waitFor(() => expect(where()).toBe('/learn/courses/c-1'))
  expect(calls).toContainEqual({ key: 'POST /course-join/guest', body: { code: 'AB12', nickname: '小明', locale: 'zh-Hant' } })
})

test('an activity QR goes into the open activity, and to the course page when it has not started', async () => {
  const open = { ...courseJoined, activity_id: 'a-1', activity_status: 'open' }
  openNamePage('/activities/a-1/join', {
    'GET /activities/a-1/public-preview': { course_name: '哲學導論', allow_guest: true, status: 'open' },
    'POST /activities/a-1/guest-join': open,
  })
  await act(async () => { fireEvent.click(await screen.findByRole('button', { name: /^加入/ })) })
  await waitFor(() => expect(where()).toBe('/learn/activities/a-1'))
})

test('an activity that has not started yet sends the guest to the course page', async () => {
  const scheduled = { ...courseJoined, activity_id: 'a-1', activity_status: 'scheduled' }
  openNamePage('/activities/a-1/join', {
    'GET /activities/a-1/public-preview': { course_name: '哲學導論', allow_guest: true, status: 'scheduled' },
    'POST /activities/a-1/guest-join': scheduled,
  })
  await act(async () => { fireEvent.click(await screen.findByRole('button', { name: /^加入/ })) })
  await waitFor(() => expect(where()).toBe('/learn/courses/c-1'))
})

test('a network failure (G11) keeps the name and lets the student send again', async () => {
  let tries = 0
  openNamePage('/join?code=AB12', {
    'POST /course-join/guest': () => {
      tries += 1
      if (tries === 1) throw new ApiError(0, 'Network Error')
      return courseJoined
    },
  })
  const input = await screen.findByLabelText('訪客名字')
  fireEvent.change(input, { target: { value: '小明' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^加入/ })) })
  expect(await screen.findByText(/沒有連上網路/)).toBeInTheDocument()
  expect(input).toHaveValue('小明')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^加入/ })) })
  await waitFor(() => expect(where()).toBe('/learn/courses/c-1'))
})

test('the teacher turning guests off meanwhile continues on the login page with the G12 notice', async () => {
  openNamePage('/join?code=AB12', { 'POST /course-join/guest': () => { throw new ApiError(403, 'GUEST_JOIN_DISABLED') } })
  await act(async () => { fireEvent.click(await screen.findByRole('button', { name: /^加入/ })) })
  expect(await screen.findByRole('heading', { name: '登入以加入課程' })).toBeInTheDocument()
  expect(window.location.pathname).toBe('/login')
  expect(screen.getByText('課程的加入方式已更新，請使用學生帳號繼續。')).toBeInTheDocument()
  expect(screen.getByText('這門課目前需要登入或註冊才能加入')).toBeInTheDocument()
  expect(screen.queryByText('不想註冊？')).toBeNull()
  expect(new URLSearchParams(window.location.search).get('next')).toBe('/join?code=AB12')
})

test('the fields are disabled while sending (G10)', async () => {
  let release: (value: unknown) => void = () => {}
  openNamePage('/join?code=AB12', { 'POST /course-join/guest': () => new Promise(resolve => { release = resolve }) })
  fireEvent.click(await screen.findByRole('button', { name: /^加入/ }))
  expect(await screen.findByRole('button', { name: /加入中/ })).toBeDisabled()
  expect(screen.getByLabelText('訪客名字')).toBeDisabled()
  await act(async () => { release(courseJoined) })
})

test('a device already signed in continues as that account instead of becoming a second guest', async () => {
  let signedIn = false
  const calls: string[] = []
  jest.mocked(api).mockImplementation(async (url: string, method = 'GET') => {
    calls.push(`${method} ${url}`)
    if (url === '/auth/me') {
      if (!signedIn) throw new ApiError(401, 'LOGIN_REQUIRED')
      return guest
    }
    if (url === '/course-join/public-preview?code=AB12') return { course_name: '哲學導論', allow_guest: true }
    if (url === '/course-join/guest') { signedIn = true; throw new ApiError(409, 'ALREADY_SIGNED_IN') }
    if (url === '/course-join/preview?code=AB12') {
      return { course_id: 'c-1', name: '哲學導論', teacher_name: '王', already_enrolled: true, default_display_name: '安靜的貓頭鷹', open_activity_title: null, allow_guest: true }
    }
    return []
  })
  openApp('/join/guest?next=' + encodeURIComponent('/join?code=AB12'))
  await act(async () => { fireEvent.click(await screen.findByRole('button', { name: /^加入/ })) })
  await waitFor(() => expect(where()).toBe('/learn/courses/c-1'))
  expect(calls.filter(call => call === 'POST /course-join/guest')).toHaveLength(1)
  expect(screen.queryByRole('alert')).toBeNull()
})

