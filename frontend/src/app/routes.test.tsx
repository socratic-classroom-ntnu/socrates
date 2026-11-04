import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { ApiError, api } from '../contract/classroomClient'
import { listSessions } from '../contract/client'
import { AuthProvider } from '../features/auth/AuthContext'
import { AppRoutes } from './routes'

jest.mock('../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../contract/classroomClient')>('../contract/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})
jest.mock('../contract/client', () => {
  const actual = jest.requireActual<typeof import('../contract/client')>('../contract/client')
  return { ...actual, listSessions: jest.fn(), createSession: jest.fn() }
})

// 舊頁換成標記：這裡只驗證網址對到哪一頁、登入守門與返回，不測舊頁本身。
// 分組教室的轉接元件不渲染真正的 Classroom：它會打 /groups/classrooms/:id、/classrooms/:id 並開 WebSocket，由元件自己的測試負責。
jest.mock('./legacyRoutes', () => {
  const { useParams, useLocation: loc } = jest.requireActual('react-router-dom')
  return {
    LegacyClassroomRoute: () => { const { roomId } = useParams(); return <p>room:{roomId}</p> },
    LegacyTeacherRoute: () => { const { search } = loc(); return <p>teacher-home:{search}</p> },
    LegacyTeacherCourseRoute: () => { const { courseId } = useParams(); return <p>teacher-course:{courseId}</p> },
  }
})
jest.mock('../features/student-classroom/GroupsPage', () => ({ GroupsPage: () => <p>groups-page</p> }))
// 課程與單人活動的新頁換成標記：各頁自己的測試負責內容
jest.mock('../features/solo-activity/SoloActivityPage', () => {
  const { useParams } = jest.requireActual('react-router-dom')
  return { SoloActivityPage: () => { const { activityId } = useParams(); return <p>solo-activity-page:{activityId}</p> } }
})
jest.mock('../features/solo-activity/SoloDialoguePage', () => {
  const { useParams } = jest.requireActual('react-router-dom')
  return { SoloDialoguePage: () => { const { activityId } = useParams(); return <p>solo-dialogue-page:{activityId}</p> } }
})
jest.mock('../features/course/join/JoinCoursePage', () => {
  const { useLocation: loc } = jest.requireActual('react-router-dom')
  return { JoinCoursePage: () => <p>join-course-page:{loc().search}</p> }
})
jest.mock('../features/course/join/JoinActivityPage', () => {
  const { useParams } = jest.requireActual('react-router-dom')
  return { JoinActivityPage: () => { const { activityId } = useParams(); return <p>join-activity-page:{activityId}</p> } }
})
jest.mock('../features/course/learn/StudentCoursePage', () => {
  const { useParams } = jest.requireActual('react-router-dom')
  return { StudentCoursePage: () => { const { courseId } = useParams(); return <p>student-course-page:{courseId}</p> } }
})
jest.mock('../features/course/home/HomePage', () => {
  const { useLocation: loc } = jest.requireActual('react-router-dom')
  return { HomePage: () => { const { search } = loc(); return <p>home-page:{search}</p> } }
})
jest.mock('../features/course/teach/editor/ActivityEditorPage', () => {
  const { useLocation: loc } = jest.requireActual('react-router-dom')
  return { ActivityEditorPage: () => <p>editor-page:{loc().pathname}</p> }
})
jest.mock('../features/course/teach/TeacherCoursePage', () => {
  const { useLocation: loc } = jest.requireActual('react-router-dom')
  return { TeacherCoursePage: () => <p>teacher-course-page:{loc().pathname}</p> }
})
jest.mock('../features/course/teach/TeacherLivePage', () => {
  const { useParams } = jest.requireActual('react-router-dom')
  return { TeacherLivePage: () => { const { activityId } = useParams(); return <p>{`teacher-live-page:${activityId}`}</p> } }
})
jest.mock('../features/course/teach/TeacherAnalysisPage', () => {
  const { useParams } = jest.requireActual('react-router-dom')
  return { TeacherAnalysisPage: () => { const { activityId } = useParams(); return <p>{`teacher-analysis-page:${activityId}`}</p> } }
})
jest.mock('../features/round1/History', () => () => <p>solo-dialogue-history</p>)
jest.mock('../features/round1/Conversation', () => () => <p>solo-dialogue-conversation</p>)
jest.mock('../features/round1/Summary', () => () => <p>solo-dialogue-summary</p>)
// 3D 舞台、分組課堂與 AI 設定和路由無關，jsdom 也載不了它們用到的 ESM（three、.mjs），換成空元件
jest.mock('../features/classroom-stage/Arena', () => ({ Arena: () => null }))
jest.mock('../features/group-dialogue/GroupClassroom', () => ({ GroupClassroomGate: () => null }))
jest.mock('../features/ai-settings/ProviderSettings', () => ({ ProviderSettings: () => null }))
jest.mock('../features/danmaku/Danmaku', () => ({ __esModule: true, default: () => <p>如果說謊能讓一個人免於痛苦，說謊是對的嗎？</p> }))

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

// 透過真的登入頁登入
async function login(button = '登入') {
  fireEvent.change(await screen.findByLabelText('使用者名稱或 Email'), { target: { value: 'Fizzy' } })
  fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'secret' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: button })) })
}

beforeEach(() => {
  jest.mocked(api).mockReset()
  jest.mocked(listSessions).mockResolvedValue({ items: [], next_cursor: null })
})

test.each([
  ['/groups', 'groups-page'],
  ['/groups?view=providers', 'groups-page'],
  ['/classrooms/r1?mode=teacher', 'room:r1'],
  ['/teacher/home?view=store', 'teacher-home:?view=store'],
  ['/teacher/courses/c1', 'teacher-course:c1'],
])('renders each legacy route: %s', async (url, marker) => {
  mockSession(verified)
  open(url)
  expect(await screen.findByText(marker)).toBeInTheDocument()
  expect(where()).toBe(url)
})

// 課程頁還沒搬：先斷言佔位頁，搬一頁換一列成新頁的標記
test.each([
  ['/', 'home-page:'],
  ['/join?code=AB12', 'join-course-page:?code=AB12'],
  ['/activities/a1/join', 'join-activity-page:a1'],
  ['/learn/courses/c1', 'student-course-page:c1'],
  ['/learn/activities/a1', 'solo-activity-page:a1'],
  ['/learn/activities/a1/dialogue', 'solo-dialogue-page:a1'],
  ['/teach/courses/c1', 'teacher-course-page:/teach/courses/c1'],
  ['/teach/courses/c1/students', 'teacher-course-page:/teach/courses/c1/students'],
  ['/teach/courses/c1/settings', 'teacher-course-page:/teach/courses/c1/settings'],
  ['/teach/courses/c1/activities/new', 'editor-page:/teach/courses/c1/activities/new'],
  ['/teach/activities/a1/edit', 'editor-page:/teach/activities/a1/edit'],
  ['/teach/activities/a1', 'teacher-live-page:a1'],
  ['/teach/activities/a1/analysis', 'teacher-analysis-page:a1'],
  ['/teach/activities/a1/analysis/ai', '功能開發中'],
  ['/teach/courses/c1/projector', '功能開發中'],
  ['/teach/activities/a1/projector', '功能開發中'],
  ['/scan', '功能開發中'],
  ['/account', '功能開發中'],
])('renders each course route: %s', async (url, marker) => {
  mockSession(verified)
  open(url)
  expect(await screen.findByText(marker)).toBeInTheDocument()
  expect(where()).toBe(url)
})

test('old providers link moves to the groups page', async () => {
  mockSession(verified)
  open('/?view=providers')
  await waitFor(() => expect(where()).toBe('/groups?view=providers'))
  expect(await screen.findByText('groups-page')).toBeInTheDocument()
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

test('signed-out deep link returns after login with query and hash', async () => {
  mockSession(null)
  open('/teacher/courses/c1?view=bank#top')
  await waitFor(() => expect(where()).toBe('/login?next=' + encodeURIComponent('/teacher/courses/c1?view=bank#top')))
  await login()
  expect(where()).toBe('/teacher/courses/c1?view=bank#top')
  expect(await screen.findByText('teacher-course:c1')).toBeInTheDocument()
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

test('legacy verify link on any path goes to /verify', async () => {
  mockSession(null)
  open('/teacher/home?verify_token=abc')
  await waitFor(() => expect(where()).toBe('/verify?token=abc'))
})

test('legacy reset link on any path goes to reset mode', async () => {
  mockSession(null)
  open('/classrooms/r1?reset_token=xyz')
  await waitFor(() => expect(where()).toBe('/login?mode=reset&token=xyz'))
  expect(await screen.findByLabelText('新密碼')).toBeInTheDocument()
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

test('unverified account on teacher pages goes to verification', async () => {
  mockSession({ ...verified, verified: false })
  open('/teacher/home')
  expect(await screen.findByRole('heading', { name: '確認你的 Email' })).toBeInTheDocument()
  expect(screen.queryByText(/teacher-home/)).toBeNull()
})

const DEMO_PAGES: [string, string, string][] = [
  ['/question-bank', '教師題庫畫面', '科技系統與社會發展 A'],
  ['/danmaku', '學生彈幕畫面', '如果說謊能讓一個人免於痛苦，說謊是對的嗎？'],
  ['/waiting-room', '上課前等待室', '[教室編號]'],
  ['/group-result', '分組結果', '分組完成'],
  ['/poll-result', '選項占比', '說謊能讓人免於痛苦，是對的嗎？'],
  ['/activity-form', '教師出題表單', '新增活動'],
]
const DEMO_PATHS = DEMO_PAGES.map(([url]) => url)

test.each(DEMO_PATHS)('demo page %s renders inside DemoSurface', async (url) => {
  const [, title, content] = DEMO_PAGES.find(([path]) => path === url)!
  mockSession(verified)
  open(url)
  expect(await screen.findByText('示範資料')).toBeInTheDocument()
  expect(screen.getByText(title)).toBeInTheDocument()
  expect(screen.getByText(content)).toBeInTheDocument()
  expect(where()).toBe(url)
})

test('demo pages stay behind the login boundary', async () => {
  mockSession(null)
  open('/question-bank')
  await waitFor(() => expect(where()).toBe('/login?next=' + encodeURIComponent('/question-bank')))
  expect(screen.queryByText('科技系統與社會發展 A')).toBeNull()
})

test('legacy solo-dialogue URL still opens', async () => {
  mockSession(null)
  open('/round1')
  expect(await screen.findByRole('heading', { name: '照見你的立場' })).toBeInTheDocument()
  expect(where()).toBe('/round1')
})

test.each([
  ['/history', 'solo-dialogue-history'],
  ['/sessions/s1', 'solo-dialogue-conversation'],
  ['/sessions/s1/summary', 'solo-dialogue-summary'],
])('solo-dialogue routes need no login: %s', async (url, marker) => {
  mockSession(null)
  open(url)
  expect(await screen.findByText(marker)).toBeInTheDocument()
  expect(where()).toBe(url)
})

test('classroom deep link reaches the classroom adapter', async () => {
  mockSession(verified)
  open('/classrooms/r1?mode=student')
  expect(await screen.findByText('room:r1')).toBeInTheDocument()
  expect(where()).toBe('/classrooms/r1?mode=student')
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

  test.each(['/teach/activities/a1/analysis/ai', '/teach/activities/a1/projector'])('%s', async (url) => {
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
    open('/teach/activities/a1/analysis/ai')
    expect(await screen.findByRole('link', { name: /回到課程/ })).toHaveAttribute('href', '/?tab=teach')
  })
})

test('unknown path shows not found', async () => {
  mockSession(verified)
  open('/nope')
  expect(await screen.findByText('找不到這個頁面')).toBeInTheDocument()
})
