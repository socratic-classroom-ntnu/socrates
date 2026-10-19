import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ApiError, api } from '../api/classroomClient'
import { TeacherShell } from '../pages/TeacherDashboard'
import { AppShell } from './AppShell'
import { AuthProvider, useAuth } from './AuthContext'
import { useShellBack } from './shellContext'

jest.mock('../api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../api/classroomClient')>('../api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})

let serverLocale = 'zh-Hant'
let auth: ReturnType<typeof useAuth>

function Where() {
  const { pathname, search } = useLocation()
  auth = useAuth()
  return <output data-testid="where">{pathname + search}</output>
}

function open(url: string, page = <p>page-body</p>) {
  return render(<MemoryRouter initialEntries={[url]}>
    <AuthProvider>
      <Routes>
        <Route element={<AppShell />}><Route path="*" element={page} /></Route>
        <Route path="/login" element={<p>login-page</p>} />
      </Routes>
      <Where />
    </AuthProvider>
  </MemoryRouter>)
}

function account() {
  return { id: 'u-1', username: 'Fizzy', email: 'fizzy@example.org', verified: true, csrf_token: 'c', locale: serverLocale }
}

async function openAccountMenu(name = '帳號選單') {
  const trigger = await screen.findByRole('button', { name })
  await act(async () => { fireEvent.click(trigger) })
  return screen.getByRole('menu', { name })
}

async function chooseLanguage(name: string) {
  const menu = await openAccountMenu()
  await act(async () => { fireEvent.click(within(menu).getByRole('menuitem', { name: /^語言/ })) })
  await act(async () => { fireEvent.click(screen.getByRole('menuitemradio', { name })) })
}

function phone() {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: (query: string) => ({
    matches: query.includes('max-width: 767px'), media: query, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true },
  }) })
}

const desktopMatchMedia = window.matchMedia

beforeEach(() => {
  serverLocale = 'zh-Hant'
  jest.mocked(api).mockReset()
  jest.mocked(api).mockImplementation(async (url: string, method?: string, body?: Record<string, unknown>) => {
    if (url === '/auth/me') return account()
    if (url === '/account/locale' && method === 'PUT') { serverLocale = String(body.locale); return account() }
    if (url === '/auth/logout') return {}
    return []
  })
})

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: desktopMatchMedia })
})

test('marks current nav item', async () => {
  open('/teacher/home?view=store')
  const store = await screen.findByRole('link', { name: '題庫商店' })
  expect(store).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: '分組課' })).not.toHaveAttribute('aria-current')
  expect(screen.getByRole('link', { name: '首頁' })).not.toHaveAttribute('aria-current')
})

test('sidebar lists the five M2 items', async () => {
  open('/')
  const nav = await screen.findByRole('navigation', { name: '主選單' })
  expect(within(within(nav).getByRole('list')).getAllByRole('link').map(link => [link.textContent, link.getAttribute('href')])).toEqual([
    ['首頁', '/'],
    ['分組課', '/groups'],
    ['個人題庫', '/teacher/home?view=bank'],
    ['題庫商店', '/teacher/home?view=store'],
    ['AI 連線設定', '/teacher/home?view=settings'],
  ])
})

test.each([
  ['/', '首頁'],
  ['/learn/courses/c-1', '首頁'],
  ['/teach/activities/a-1/edit', '首頁'],
  ['/groups', '分組課'],
  ['/teacher/home', '分組課'],
  ['/teacher/courses/c1', '分組課'],
  ['/teacher/home?view=bank', '個人題庫'],
  ['/teacher/home?view=settings', 'AI 連線設定'],
])('%s highlights %s', async (url, label) => {
  open(url)
  expect(await screen.findByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
})

test('shows the signed-in user and the page body', async () => {
  open('/')
  const trigger = await screen.findByRole('button', { name: '帳號選單' })
  expect(trigger).toHaveTextContent('Fizzy')
  expect(trigger).toHaveTextContent('fizzy@example.org')
  expect(screen.getByText('page-body')).toBeInTheDocument()
})

test('account menu switches language', async () => {
  open('/teacher/home')
  await chooseLanguage('English')
  expect(await screen.findByRole('link', { name: 'Question store' })).toBeInTheDocument()
  await waitFor(() => expect(api).toHaveBeenCalledWith('/account/locale', 'PUT', { locale: 'en' }))
  await waitFor(() => expect(auth.account.locale).toBe('en'))
  const menu = await openAccountMenu('Account menu')
  fireEvent.click(within(menu).getByRole('menuitem', { name: /^Language/ }))
  expect(screen.getByRole('menuitemradio', { name: 'English' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByRole('menuitemradio', { name: '繁體中文' })).toHaveAttribute('aria-checked', 'false')
})

test('failed account locale update restores the server locale and explains the failure', async () => {
  jest.mocked(api).mockImplementation(async (url: string, method?: string) => {
    if (url === '/auth/me') return account()
    if (url === '/account/locale' && method === 'PUT') throw new ApiError(500, 'LOCALE_SAVE_FAILED')
    return []
  })
  open('/teacher/home')

  await chooseLanguage('Español')

  expect(await screen.findByRole('alert')).toHaveTextContent('伺服器暫時無法處理，請稍後再試。')
  expect(document.documentElement.lang).toBe('zh-Hant')
  expect(localStorage.getItem('socrates.locale')).toBe('zh-Hant')
  expect(screen.getByRole('link', { name: '題庫商店' })).toBeInTheDocument()
  expect(auth.account.locale).toBe('zh-Hant')
})

test('refresh after switching does not revert locale', async () => {
  open('/teacher/home')
  await chooseLanguage('English')
  await waitFor(() => expect(auth.account.locale).toBe('en'))
  await act(async () => { await auth.refresh() })
  expect(document.documentElement.lang).toBe('en')
  expect(screen.getByRole('link', { name: 'Question store' })).toBeInTheDocument()
})

test('account menu closes on Escape and returns focus', async () => {
  open('/')
  const menu = await openAccountMenu()
  fireEvent.keyDown(menu, { key: 'Escape' })
  expect(screen.queryByRole('menu')).toBeNull()
  expect(screen.getByRole('button', { name: '帳號選單' })).toHaveFocus()
})

test('personal settings goes to the account placeholder', async () => {
  open('/')
  const menu = await openAccountMenu()
  await act(async () => { fireEvent.click(within(menu).getByRole('menuitem', { name: '個人設定' })) })
  expect(screen.getByTestId('where')).toHaveTextContent('/account')
})

test('logout from account menu goes to login', async () => {
  open('/teacher/home')
  const menu = await openAccountMenu()
  await act(async () => { fireEvent.click(within(menu).getByRole('menuitem', { name: '登出' })) })
  expect(api).toHaveBeenCalledWith('/auth/logout', 'POST')
  await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login'))
})

test('collapse is remembered', async () => {
  const first = open('/')
  const collapse = await screen.findByRole('button', { name: '收合側邊欄' })
  await act(async () => { fireEvent.click(collapse) })
  expect(localStorage.getItem('socrates.shell.collapsed')).toBe('true')
  first.unmount()

  open('/')
  expect(await screen.findByRole('button', { name: '展開側邊欄' })).toBeInTheDocument()
  const store = screen.getByRole('link', { name: '題庫商店' })
  expect(store).toHaveAttribute('title', '題庫商店')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '展開側邊欄' })) })
  expect(localStorage.getItem('socrates.shell.collapsed')).toBe('false')
})

test('collapse survives broken storage', async () => {
  jest.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  jest.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  open('/')
  const collapse = await screen.findByRole('button', { name: '收合側邊欄' })
  await act(async () => { fireEvent.click(collapse) })
  expect(screen.getByRole('button', { name: '展開側邊欄' })).toBeInTheDocument()
})

test('phone shows nav items in account menu', async () => {
  phone()
  open('/groups')
  const menu = await openAccountMenu()
  expect(screen.queryByRole('navigation', { name: '主選單' })).toBeNull()
  expect(within(menu).getByRole('menuitem', { name: '分組課' })).toBeInTheDocument()
  expect(within(menu).getAllByRole('menuitem').map(item => item.textContent).slice(0, 5))
    .toEqual(['首頁', '分組課', '個人題庫', '題庫商店', 'AI 連線設定'])
})

function CoursePage() {
  useShellBack('/?tab=learn', '我學的課')
  return <p>course-page</p>
}

test('phone top bar shows page back link', async () => {
  phone()
  open('/learn/courses/c-1', <CoursePage />)
  const back = await screen.findByRole('link', { name: '我學的課' })
  expect(back).toHaveAttribute('href', '/?tab=learn')
})

test('legacy teacher page renders without its own sidebar', async () => {
  open('/teacher/home?view=bank', <TeacherShell active="bank"><p>bank-body</p></TeacherShell>)
  expect(await screen.findByText('bank-body')).toBeInTheDocument()
  expect(document.querySelector('nav[aria-label="教師端"]')).toBeNull()
  expect(screen.getAllByRole('navigation')).toHaveLength(1)
})

test('a teacher page outside the shell keeps its own sidebar', () => {
  render(<MemoryRouter><TeacherShell active="bank"><p>bank-body</p></TeacherShell></MemoryRouter>)
  expect(document.querySelector('nav[aria-label="教師端"]')).not.toBeNull()
})
