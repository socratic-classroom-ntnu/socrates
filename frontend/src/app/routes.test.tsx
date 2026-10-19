import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { ApiError, api } from '../api/classroomClient'
import { AuthProvider } from './AuthContext'
import { AppRoutes } from './routes'

jest.mock('../api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../api/classroomClient')>('../api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})

// 舊頁換成標記：這裡只驗證網址對到哪一頁、登入守門與返回，不測舊頁本身
jest.mock('../ClassroomApp', () => {
  const { useParams, useLocation: loc } = jest.requireActual('react-router-dom')
  return {
    LegacyStudentHome: () => <p>student-home</p>,
    LegacyClassroomRoute: () => { const { roomId } = useParams(); return <p>room:{roomId}</p> },
    LegacyTeacherRoute: () => { const { search } = loc(); return <p>teacher-home:{search}</p> },
    LegacyTeacherCourseRoute: () => { const { courseId } = useParams(); return <p>teacher-course:{courseId}</p> },
  }
})
jest.mock('../pages/Home', () => () => <p>round1-home</p>)
jest.mock('../pages/History', () => () => <p>round1-history</p>)
jest.mock('../pages/Conversation', () => () => <p>round1-conversation</p>)
jest.mock('../pages/Summary', () => () => <p>round1-summary</p>)

const verified = { id: 'u-1', username: 'Fizzy', verified: true, csrf_token: 'c', locale: 'zh-Hant' }

function Where() {
  const { pathname, search, hash } = useLocation()
  return <output data-testid="where">{pathname + search + hash}</output>
}

function mockSession(account: object | null) {
  jest.mocked(api).mockImplementation(async (url: string) => {
    if (url === '/auth/me') {
      if (!account) throw new ApiError(401, 'LOGIN_REQUIRED')
      return account
    }
    if (url === '/auth/login') return verified
    if (url === '/auth/verify') return { verified: true }
    return []
  })
}

function open(url: string) {
  render(<MemoryRouter initialEntries={[url]}><AuthProvider><AppRoutes /><Where /></AuthProvider></MemoryRouter>)
}

const where = () => screen.getByTestId('where').textContent

// 透過真的登入頁登入（Task 9 之後 /login 是 LoginPage）
async function login() {
  fireEvent.change(await screen.findByLabelText('使用者名稱或 Email'), { target: { value: 'Fizzy' } })
  fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'secret' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '登入' })) })
}

beforeEach(() => jest.mocked(api).mockReset())

test.each([
  ['/', 'student-home'],
  ['/?view=providers', 'student-home'],
  ['/classrooms/r1?mode=teacher', 'room:r1'],
  ['/teacher/home?view=store', 'teacher-home:?view=store'],
  ['/teacher/courses/c1', 'teacher-course:c1'],
  ['/activities/a1/join', '功能開發中'],
])('renders each legacy route: %s', async (url, marker) => {
  mockSession(verified)
  open(url)
  expect(await screen.findByText(marker)).toBeInTheDocument()
  expect(where()).toBe(url)
})

test('returns to deep link after login', async () => {
  mockSession(null)
  open('/teacher/home?view=bank#teacher-content')
  await waitFor(() => expect(where()).toBe('/login?next=' + encodeURIComponent('/teacher/home?view=bank#teacher-content')))
  await login()
  expect(where()).toBe('/teacher/home?view=bank#teacher-content')
  expect(await screen.findByText('teacher-home:?view=bank')).toBeInTheDocument()
})

test('returns to activity QR after login', async () => {
  mockSession(null)
  open('/activities/a-1/join?from=qr#confirm')
  await login()
  expect(where()).toBe('/activities/a-1/join?from=qr#confirm')
  expect(screen.getByText('功能開發中')).toBeInTheDocument()
})

test('anonymous verification token is not put behind auth', async () => {
  mockSession(null)
  open('/?verify_token=x')
  await waitFor(() => expect(api).toHaveBeenCalledWith('/auth/verify', 'POST', { token: 'x' }))
  expect(where()).not.toMatch(/^\/login\?next=/)
})

test('drops one-time tokens from ordinary next', async () => {
  mockSession(null)
  open('/?reset_token=zz')
  await waitFor(() => expect(where()).toBe('/login?mode=reset&token=zz'))
  expect(where()).not.toContain('next=')
})

test.each(['https://evil.example', '//evil.example'])('rejects external next: %s', async (target) => {
  mockSession(null)
  open('/login?next=' + encodeURIComponent(target))
  await login()
  expect(where()).toBe('/')
})

test('signed-in visitors skip the login page', async () => {
  mockSession(verified)
  open('/login?next=' + encodeURIComponent('/teacher/home'))
  await waitFor(() => expect(where()).toBe('/teacher/home'))
})

// 未驗證帳號打開教師端書籤，要先看到驗證頁，而不是被後端 403 擋住的畫面
test.each(['/teacher/home?view=bank', '/teacher/courses/c-1'])('unverified teacher goes to verify: %s', async (url) => {
  mockSession({ ...verified, verified: false })
  open(url)
  expect(await screen.findByRole('heading', { name: '確認你的 Email' })).toBeInTheDocument()
  expect(where()).toBe('/verify?next=' + encodeURIComponent(url))
})

test.each([
  ['/round1', 'round1-home'],
  ['/history', 'round1-history'],
  ['/sessions/s1', 'round1-conversation'],
  ['/sessions/s1/summary', 'round1-summary'],
])('round1 routes need no login: %s', async (url, marker) => {
  mockSession(null)
  open(url)
  expect(await screen.findByText(marker)).toBeInTheDocument()
  expect(where()).toBe(url)
})

test('unknown path shows not found', async () => {
  mockSession(verified)
  open('/nope')
  expect(await screen.findByText('找不到這個頁面')).toBeInTheDocument()
})
