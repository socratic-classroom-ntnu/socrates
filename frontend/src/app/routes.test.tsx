import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { ApiError, api } from '../contract/classroomClient'
import { AuthProvider } from '../features/auth/AuthContext'
import { AppRoutes } from './routes'

jest.mock('../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../contract/classroomClient')>('../contract/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
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
jest.mock('../features/ai-settings/AIConnectionPage', () => ({ AIConnectionPage: () => <p>ai-settings-page</p> }))
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
jest.mock('../features/course/scan/ScanPage', () => ({ ScanPage: () => <p>scan-page</p> }))
jest.mock('../features/course/learn/StudentCoursePage', () => {
  const { useParams } = jest.requireActual('react-router-dom')
  return { StudentCoursePage: () => { const { courseId } = useParams(); return <p>student-course-page:{courseId}</p> } }
})
jest.mock('../features/course/practice/MyDialoguesPage', () => ({ MyDialoguesPage: () => <p>my-dialogues-page</p> }))
jest.mock('../features/auth/GuestAccountPages', () => ({
  GuestUpgradePage: () => <p>guest-upgrade-page</p>,
  GuestLoginPage: () => <p>guest-login-page</p>,
}))
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
jest.mock('../features/course/teach/transcript/TeacherTranscriptPage', () => {
  const { useParams } = jest.requireActual<typeof import('react-router-dom')>('react-router-dom')
  return { TeacherTranscriptPage: () => { const { activityId, enrollmentId } = useParams(); return <p>{`teacher-transcript-page:${activityId}:${enrollmentId}`}</p> } }
})
jest.mock('../features/course/teach/TeacherLivePage', () => {
  const { useParams } = jest.requireActual('react-router-dom')
  return { TeacherLivePage: () => { const { activityId } = useParams(); return <p>{`teacher-live-page:${activityId}`}</p> } }
})
jest.mock('../features/course/teach/TeacherAnalysisPage', () => {
  const { useParams } = jest.requireActual('react-router-dom')
  return { TeacherAnalysisPage: () => { const { activityId } = useParams(); return <p>{`teacher-analysis-page:${activityId}`}</p> } }
})
jest.mock('../features/course/teach/ProjectorPages', () => ({
  CourseProjectorPage: () => <p>course-projector-page</p>,
  ActivityProjectorPage: () => <p>activity-projector-page</p>,
}))
// 3D 舞台、分組課堂與 AI 設定和路由無關，jsdom 也載不了它們用到的 ESM（three、.mjs），換成空元件
jest.mock('../features/classroom-stage/Arena', () => ({ Arena: () => null }))
jest.mock('../features/group-dialogue/GroupClassroom', () => ({ GroupClassroomGate: () => null }))
jest.mock('../features/ai-settings/ProviderSettings', () => ({ ProviderSettings: () => null }))
jest.mock('../features/danmaku/Danmaku', () => ({ __esModule: true, default: () => <p>如果說謊能讓一個人免於痛苦，說謊是對的嗎？</p> }))

const verified = { id: 'u-1', username: 'Fizzy', verified: true, csrf_token: 'c', locale: 'zh-Hant', account_role: 'student' }
const teacher = { ...verified, account_role: 'teacher' }

function Where() {
  const { pathname, search, hash } = useLocation()
  return <output data-testid="where">{pathname + search + hash}</output>
}

function mockSession(account: object | null, loggedIn: object = verified) {
  jest.mocked(api).mockImplementation(async (url: string) => {
    if (url === '/auth/me') {
      if (!account) throw new ApiError(401, 'LOGIN_REQUIRED')
      return account
    }
    if (url === '/auth/login') return loggedIn
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
})

test.each([
  ['/groups', 'groups-page'],
  ['/classrooms/r1?mode=teacher', 'room:r1'],
  ['/teacher/home?view=store', 'teacher-home:?view=store'],
  ['/teacher/courses/c1', 'teacher-course:c1'],
])('renders each legacy route: %s', async (url, marker) => {
  mockSession(url.startsWith('/teacher') ? teacher : verified)
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
  ['/teach/activities/a1/students/e9', 'teacher-transcript-page:a1:e9'],
  ['/teach/activities/a1/analysis', 'teacher-analysis-page:a1'],
  ['/teach/activities/a1/analysis/ai', '功能開發中'],
  ['/teach/courses/c1/projector', 'course-projector-page'],
  ['/teach/activities/a1/projector', 'activity-projector-page'],
  ['/account', '個人檔案'],
  ['/my-dialogues', 'my-dialogues-page'],
  // 訪客帳號面板的兩個入口：註冊升級（G16–G19）與登入併入（G20–G24）
  ['/guest/register', 'guest-upgrade-page'],
  ['/guest/login', 'guest-login-page'],
])('renders each course route: %s', async (url, marker) => {
  mockSession(url.startsWith('/teach') ? teacher : verified)
  open(url)
  expect(await screen.findByText(marker)).toBeInTheDocument()
  expect(where()).toBe(url)
})

test('the AI connection page is a teacher page', async () => {
  mockSession(teacher)
  open('/teach/ai-settings')
  expect(await screen.findByText('ai-settings-page')).toBeInTheDocument()
})

test('a student opening the AI connection page sees that it is a teacher page', async () => {
  mockSession(verified)
  open('/teach/ai-settings')
  expect(await screen.findByRole('heading', { name: '這是老師的頁面' })).toBeInTheDocument()
  expect(screen.queryByText('ai-settings-page')).not.toBeInTheDocument()
  expect(where()).toBe('/teach/ai-settings')
})

// 舊的多連線頁能改同一份設定，留著會讓新頁面顯示的跟學生實際用的不一樣：一律轉到新網址。
test.each(['/?view=providers', '/groups?view=providers', '/teacher/home?view=settings'])(
  'the old AI settings entry %s moves to the new page',
  async url => {
    mockSession(teacher)
    open(url)
    await waitFor(() => expect(where()).toBe('/teach/ai-settings'))
    expect(await screen.findByText('ai-settings-page')).toBeInTheDocument()
  },
)

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
  mockSession(null, teacher)
  open('/teacher/home?view=bank#teacher-content')
  await waitFor(() => expect(where()).toBe('/login?next=' + encodeURIComponent('/teacher/home?view=bank#teacher-content')))
  await login()
  expect(where()).toBe('/teacher/home?view=bank#teacher-content')
  expect(await screen.findByText('teacher-home:?view=bank')).toBeInTheDocument()
})

test('signed-out deep link returns after login with query and hash', async () => {
  mockSession(null, teacher)
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
  await login('登入並加入活動')
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
  mockSession(teacher)
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

test.each(['/history', '/sessions/s1', '/sessions/s1/summary'])(
  'the removed legacy solo dialogue URLs are not found: %s',
  async (url) => {
    mockSession(null)
    open(url)
    expect(await screen.findByRole('heading', { name: '找不到這個頁面' })).toBeInTheDocument()
  },
)

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
    '/teach/activities/a1/students/e9',
    '/teach/courses/c1/projector',
    '/teach/create-course',
    '/teacher/home?view=bank',
    '/teacher/courses/c1',
  ])('%s shows S4m', async (url) => {
    phone()
    mockSession(teacher)
    open(url)
    expect(await screen.findByText('暫時不支援手機操作')).toBeInTheDocument()
    expect(screen.queryByText(/teacher-course-page/)).toBeNull()
    expect(where()).toBe(url)
    // 首頁已經沒有「我教的課」分頁：頂部列與按鈕都回首頁
    expect(screen.getByRole('link', { name: '回首頁' })).toHaveAttribute('href', '/')
    expect(screen.queryByText(/我教的課/)).toBeNull()
  })
})

// 個人設定的手機內頁（M02–M16）：手機進得去，電腦回 /account
test.each(['/account/avatar', '/account/password', '/account/delete'])('%s is a phone page of the account settings', async (url) => {
  const desktopMatchMedia = window.matchMedia
  try {
    phone()
    mockSession(verified)
    open(url)
    expect(await screen.findByRole('button', { name: '返回' })).toBeInTheDocument()
    expect(where()).toBe(url)
  } finally {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: desktopMatchMedia })
  }
})

test.each(['/account/avatar', '/account/password', '/account/delete'])('%s on a computer goes back to /account', async (url) => {
  mockSession(verified)
  open(url)
  await waitFor(() => expect(where()).toBe('/account'))
})

test('create-course on a desktop opens the drawer on the home page', async () => {
  mockSession(teacher)
  open('/teach/create-course')
  await waitFor(() => expect(where()).toBe('/?tab=teach&create=1'))
})

describe('teacher placeholders go back to their course', () => {
  function withActivity() {
    jest.mocked(api).mockImplementation(async (url: string) => {
      if (url === '/auth/me') return teacher
      if (url === '/activities/a1') return { id: 'a1', course_id: 'c9' }
      return []
    })
  }

  test('/teach/activities/a1/analysis/ai', async () => {
    withActivity()
    open('/teach/activities/a1/analysis/ai')
    expect(await screen.findByText('功能開發中')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('link', { name: /回到課程/ })).toHaveAttribute('href', '/teach/courses/c9'))
  })

  test('an unknown activity falls back to my teaching', async () => {
    jest.mocked(api).mockImplementation(async (url: string) => {
      if (url === '/auth/me') return teacher
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

// 帳號只有一個角色：打開另一邊的頁面，在原網址、外框裡顯示說明頁，頁面本身不 render、不發 API（P14–P19）
describe('pages of the other role', () => {
  const desktopMatchMedia = window.matchMedia
  afterEach(() => { Object.defineProperty(window, 'matchMedia', { configurable: true, value: desktopMatchMedia }) })
  const calls = () => jest.mocked(api).mock.calls.map(([url]) => url)

  test.each([
    ['/teach/courses/c1', false],
    ['/teach/activities/a1/projector', false],
    ['/teacher/home?view=bank', false],
    ['/teacher/courses/c1', false],
    ['/teach/courses/c1', true],
    ['/teacher/home', true],
  ])('a student opening %s (phone: %s) sees the teacher-page explanation', async (url, onPhone) => {
    if (onPhone) phone()
    mockSession(verified)
    open(url)
    expect(await screen.findByRole('heading', { name: '這是老師的頁面' })).toBeInTheDocument()
    expect(screen.getByText('你現在登入的是學生帳號。')).toBeInTheDocument()
    expect(screen.queryByText(/teacher-|editor-page|功能開發中|暫時不支援手機操作/)).toBeNull()
    expect(where()).toBe(url)
    expect(calls().every(called => called === '/auth/me')).toBe(true)
  })

  test.each([
    ['/my-dialogues', false],
    ['/learn/courses/c1', false],
    ['/learn/activities/a1', false],
    ['/learn/activities/a1/dialogue', false],
    ['/scan', false],
    ['/learn/courses/c1', true],
  ])('a teacher opening %s (phone: %s) sees the student-page explanation', async (url, onPhone) => {
    if (onPhone) phone()
    mockSession(teacher)
    open(url)
    expect(await screen.findByRole('heading', { name: '這是學生的頁面' })).toBeInTheDocument()
    expect(screen.getByText('學生的頁面要用學生帳號開啟。')).toBeInTheDocument()
    expect(screen.queryByText(/student-course-page|solo-|功能開發中/)).toBeNull()
    expect(calls().every(called => called === '/auth/me')).toBe(true)
  })

  test('no nav item is marked current on the explanation page', async () => {
    mockSession(verified)
    open('/teach/courses/c1')
    await screen.findByRole('heading', { name: '這是老師的頁面' })
    expect(screen.getByRole('link', { name: '首頁' })).not.toHaveAttribute('aria-current')
  })

  test('the explanation sits inside the app shell, even for a full-screen page', async () => {
    mockSession(teacher)
    open('/learn/activities/a1/dialogue')
    expect(await screen.findByRole('heading', { name: '這是學生的頁面' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '主選單' })).toBeInTheDocument()
  })

  test.each([
    ['/join?code=AB12', '/course-join/preview?code=AB12', { name: '哲學導論' }, '你掃描的是課程 QR'],
    ['/activities/a1/join?from=qr', '/activities/a1/join-preview', { course_name: '哲學導論' }, '你掃描的是活動 QR'],
  ])('a teacher scanning %s is told to use a student account, with the course name', async (url, preview, body, scanned) => {
    jest.mocked(api).mockImplementation(async (called: string) => {
      if (called === '/auth/me') return teacher
      if (called === preview) return body
      throw new Error('unexpected ' + called)
    })
    open(url)
    expect(await screen.findByRole('heading', { name: '要用學生帳號才能加入' })).toBeInTheDocument()
    expect(await screen.findByText('哲學導論')).toBeInTheDocument()
    expect(screen.getByText(scanned)).toBeInTheDocument()
    expect(screen.queryByText(/join-course-page|join-activity-page/)).toBeNull()
    expect(calls().filter(called => called !== '/auth/me')).toEqual([preview])
  })

  test('a teacher opening /join without a code gets the explanation without a course name', async () => {
    mockSession(teacher)
    open('/join')
    expect(await screen.findByRole('heading', { name: '要用學生帳號才能加入' })).toBeInTheDocument()
    expect(screen.queryByText(/你掃描的是/)).toBeNull()
    expect(calls().every(called => called === '/auth/me')).toBe(true)
  })

  test('a failed preview leaves the course name out', async () => {
    jest.mocked(api).mockImplementation(async (called: string) => {
      if (called === '/auth/me') return teacher
      throw new ApiError(404, 'ENROLL_CODE_NOT_FOUND')
    })
    open('/join?code=NOPE')
    expect(await screen.findByRole('heading', { name: '要用學生帳號才能加入' })).toBeInTheDocument()
    await waitFor(() => expect(calls()).toContain('/course-join/preview?code=NOPE'))
    expect(screen.queryByText(/你掃描的是/)).toBeNull()
  })

  test('back home goes to the home page; signing out goes to the login page', async () => {
    mockSession(verified)
    open('/teach/courses/c1')
    expect(await screen.findByRole('link', { name: '回首頁' })).toHaveAttribute('href', '/')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '登出，改用老師帳號' })) })
    expect(api).toHaveBeenCalledWith('/auth/logout', 'POST')
    await waitFor(() => expect(where()).toBe('/login'))
  })

  test('a guest switching accounts from the explanation is asked first (G15)', async () => {
    mockSession({ ...verified, kind: 'guest', guest_expires_at: null })
    open('/teach/courses/c1')
    const button = await screen.findByRole('button', { name: '登出，改用老師帳號' })
    await act(async () => { fireEvent.click(button) })
    expect(screen.getByRole('dialog', { name: '要登出訪客身分嗎？' })).toBeInTheDocument()
    expect(api).not.toHaveBeenCalledWith('/auth/logout', 'POST')
  })

  test('an unverified student still goes to verification before the role is checked', async () => {
    mockSession({ ...verified, verified: false })
    open('/teach/courses/c1')
    expect(await screen.findByRole('heading', { name: '確認你的 Email' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '這是老師的頁面' })).toBeNull()
  })

  test('an unknown teacher path is still not found', async () => {
    mockSession(verified)
    open('/teach/nope/nope/nope')
    expect(await screen.findByText('找不到這個頁面')).toBeInTheDocument()
  })

  test.each(['/', '/groups', '/account', '/classrooms/r1'])('%s opens for both roles', async (url) => {
    for (const who of [verified, teacher]) {
      mockSession(who)
      const { unmount } = render(<MemoryRouter initialEntries={[url]}><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter>)
      await waitFor(() => expect(screen.queryByText(/這是(老師|學生)的頁面/)).toBeNull())
      expect(await screen.findByText(/home-page|groups-page|個人檔案|room:r1/)).toBeInTheDocument()
      unmount()
    }
  })
})

test('scan page is full screen without the top bar or side navigation', async () => {
  mockSession(verified)
  open('/scan')
  expect(await screen.findByText('scan-page')).toBeInTheDocument()
  expect(screen.queryByRole('banner')).toBeNull()
  expect(screen.queryByRole('navigation')).toBeNull()
  expect(where()).toBe('/scan')
})

test('signed-out scan goes to login and comes back to scan', async () => {
  mockSession(null)
  open('/scan')
  await waitFor(() => expect(where()).toBe('/login?next=' + encodeURIComponent('/scan')))
})

test('unverified scan goes to verify', async () => {
  mockSession({ ...verified, verified: false })
  open('/scan')
  await waitFor(() => expect(where()).toBe('/verify?next=' + encodeURIComponent('/scan')))
})
