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
// M2 新頁換成標記：各頁自己的測試負責內容
jest.mock('../pages/join/JoinCoursePage', () => {
  const { useLocation: loc } = jest.requireActual('react-router-dom')
  return { JoinCoursePage: () => <p>join-course-page:{loc().search}</p> }
})
jest.mock('../pages/join/JoinActivityPage', () => {
  const { useParams } = jest.requireActual('react-router-dom')
  return { JoinActivityPage: () => { const { activityId } = useParams(); return <p>join-activity-page:{activityId}</p> } }
})
jest.mock('../pages/learn/StudentCoursePage', () => {
  const { useParams } = jest.requireActual('react-router-dom')
  return { StudentCoursePage: () => { const { courseId } = useParams(); return <p>student-course-page:{courseId}</p> } }
})
jest.mock('../pages/teach/editor/ActivityEditorPage', () => {
  const { useLocation: loc } = jest.requireActual('react-router-dom')
  return { ActivityEditorPage: () => <p>editor-page:{loc().pathname}</p> }
})
jest.mock('../pages/home/HomePage', () => {
  const { useLocation: loc } = jest.requireActual('react-router-dom')
  return { HomePage: () => { const { search } = loc(); return <p>home-page:{search}</p> } }
})
jest.mock('../pages/teach/TeacherCoursePage', () => {
  const { useLocation: loc } = jest.requireActual('react-router-dom')
  return { TeacherCoursePage: () => <p>teacher-course-page:{loc().pathname}</p> }
})
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
async function login(button = '登入') {
  fireEvent.change(await screen.findByLabelText('使用者名稱或 Email'), { target: { value: 'Fizzy' } })
  fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'secret' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: button })) })
}

beforeEach(() => jest.mocked(api).mockReset())

test.each([
  ['/groups', 'student-home'],
  ['/groups?view=providers', 'student-home'],
  ['/classrooms/r1?mode=teacher', 'room:r1'],
  ['/teacher/home?view=store', 'teacher-home:?view=store'],
  ['/teacher/courses/c1', 'teacher-course:c1'],
  ['/activities/a1/join', 'join-activity-page:a1'],
])('renders each legacy route: %s', async (url, marker) => {
  mockSession(verified)
  open(url)
  expect(await screen.findByText(marker)).toBeInTheDocument()
  expect(where()).toBe(url)
})

// M2 的 route table：還沒換上實頁的列先斷言佔位頁，每個 task 換頁時改成新頁的標記
test.each([
  ['/', 'home-page:'],
  ['/join?code=AB12', 'join-course-page:?code=AB12'],
  ['/learn/courses/c1', 'student-course-page:c1'],
  ['/learn/activities/a1', '功能開發中'],
  ['/teach/courses/c1', 'teacher-course-page:/teach/courses/c1'],
  ['/teach/courses/c1/students', 'teacher-course-page:/teach/courses/c1/students'],
  ['/teach/courses/c1/settings', 'teacher-course-page:/teach/courses/c1/settings'],
  ['/teach/courses/c1/activities/new', 'editor-page:/teach/courses/c1/activities/new'],
  ['/teach/activities/a1/edit', 'editor-page:/teach/activities/a1/edit'],
  ['/teach/activities/a1', '功能開發中'],
  ['/teach/activities/a1/analysis', '功能開發中'],
  ['/teach/courses/c1/projector', '功能開發中'],
  ['/teach/activities/a1/projector', '功能開發中'],
  ['/scan', '功能開發中'],
  ['/account', '功能開發中'],
])('renders each M2 route: %s', async (url, marker) => {
  mockSession(verified)
  open(url)
  expect(await screen.findByText(marker)).toBeInTheDocument()
  expect(where()).toBe(url)
})

test('old providers link moves to the groups page', async () => {
  mockSession(verified)
  open('/?view=providers')
  await waitFor(() => expect(where()).toBe('/groups?view=providers'))
  expect(await screen.findByText('student-home')).toBeInTheDocument()
})

test('groups page links to the legacy teacher side', async () => {
  mockSession(verified)
  open('/groups')
  expect(await screen.findByText('student-home')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '管理分組課（教師端）' })).toHaveAttribute('href', '/teacher/home')
})

test('unverified account on home goes to verify', async () => {
  mockSession({ ...verified, verified: false })
  open('/')
  await waitFor(() => expect(where()).toBe('/verify?next=' + encodeURIComponent('/')))
})

test('anonymous course invite link goes to login and keeps the code', async () => {
  mockSession(null)
  open('/join?code=AB12')
  await waitFor(() => expect(where()).toBe('/login?next=%2Fjoin%3Fcode%3DAB12'))
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
  // 活動 QR 的登入是 J0 版面
  await login('登入並繼續')
  expect(where()).toBe('/activities/a-1/join?from=qr#confirm')
  expect(await screen.findByText('join-activity-page:a-1')).toBeInTheDocument()
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

function phone() {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: (query: string) => ({
    matches: query.includes('max-width: 767px'), media: query, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true },
  }) })
}

describe('teacher pages on a phone', () => {
  const desktopMatchMedia = window.matchMedia
  afterEach(() => { Object.defineProperty(window, 'matchMedia', { configurable: true, value: desktopMatchMedia }) })

  test.each([
    '/teach/courses/c1',
    '/teach/activities/a1/edit',
    '/teach/courses/c1/projector',
    '/teach/create-course',
  ])('%s shows S4m', async (url) => {
    phone()
    mockSession(verified)
    open(url)
    expect(await screen.findByText('暫時不支援手機操作')).toBeInTheDocument()
    expect(screen.queryByText(/teacher-course-page/)).toBeNull()
    expect(where()).toBe(url)
  })
})

test('create-course on a desktop opens the drawer on the home page', async () => {
  mockSession(verified)
  open('/teach/create-course')
  await waitFor(() => expect(where()).toBe('/?tab=teach&create=1'))
})

describe('teacher placeholders go back to their course', () => {
  function withActivity() {
    jest.mocked(api).mockImplementation(async (url: string) => {
      if (url === '/auth/me') return verified
      if (url === '/activities/a1') return { id: 'a1', course_id: 'c9' }
      return []
    })
  }

  test.each(['/teach/activities/a1', '/teach/activities/a1/analysis', '/teach/activities/a1/projector'])('%s', async (url) => {
    withActivity()
    open(url)
    expect(await screen.findByText('功能開發中')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('link', { name: /回到課程/ })).toHaveAttribute('href', '/teach/courses/c9'))
  })

  test('course projector goes back to its course', async () => {
    mockSession(verified)
    open('/teach/courses/c1/projector')
    expect(await screen.findByRole('link', { name: /回到課程/ })).toHaveAttribute('href', '/teach/courses/c1')
  })

  test('an unknown activity falls back to my teaching', async () => {
    jest.mocked(api).mockImplementation(async (url: string) => {
      if (url === '/auth/me') return verified
      if (url === '/activities/a1') throw new ApiError(404, 'ACTIVITY_NOT_FOUND')
      return []
    })
    open('/teach/activities/a1')
    expect(await screen.findByRole('link', { name: /回到課程/ })).toHaveAttribute('href', '/?tab=teach')
  })
})
