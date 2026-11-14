import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ApiError, api } from '../contract/classroomClient'
import { TeacherShell } from '../features/authoring/TeacherDashboard'
import { AppShell } from './AppShell'
import { AuthProvider, useAuth } from '../features/auth/AuthContext'
import { useShellBack } from '../shared/shellContext'
import { LanguageSwitcher } from '../features/auth/LanguageSwitcher'

jest.mock('../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../contract/classroomClient')>('../contract/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})

let serverLocale = 'zh-Hant'
// 帳號只有一個角色；大部分測試用老師（側欄項目最多），學生、訪客的測試自己設定
let serverAccount: Record<string, unknown> = {}
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
  return { id: 'u-1', username: 'Fizzy', email: 'fizzy@example.org', verified: true, csrf_token: 'c', locale: serverLocale, kind: 'registered', account_role: 'teacher', ...serverAccount }
}
const asStudent = () => { serverAccount = { account_role: 'student' } }
// 11/20 中午（UTC）到期：UTC−11 到 UTC+11 的瀏覽器都顯示 11/20，測試不受執行機器的時區影響
const GUEST_EXPIRES = Date.UTC(2026, 10, 20, 12, 0) / 1000
const asGuest = () => { serverAccount = { account_role: 'student', kind: 'guest', username: '好奇的海獺-1a2b3c4d', email: '', guest_expires_at: GUEST_EXPIRES } }

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
  serverAccount = {}
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
  expect(screen.getByRole('link', { name: '首頁' })).not.toHaveAttribute('aria-current')
})

// P22：側欄依帳號角色；兩邊都沒有「分組課」（路由不擋）
test('a teacher sidebar lists home, the two banks and AI settings', async () => {
  open('/')
  const nav = await screen.findByRole('navigation', { name: '主選單' })
  expect(within(within(nav).getByRole('list')).getAllByRole('link').map(link => [link.textContent, link.getAttribute('href')])).toEqual([
    ['首頁', '/'],
    ['個人題庫', '/teacher/home?view=bank'],
    ['題庫商店', '/teacher/home?view=store'],
    ['AI 連線設定', '/teacher/home?view=settings'],
  ])
})

test('a student sidebar lists only home', async () => {
  asStudent()
  open('/')
  const nav = await screen.findByRole('navigation', { name: '主選單' })
  expect(within(within(nav).getByRole('list')).getAllByRole('link').map(link => [link.textContent, link.getAttribute('href')])).toEqual([
    ['首頁', '/'],
  ])
})

// P23：側欄底部的帳號按鈕在名字旁標出角色
test.each([
  ['teacher', '老師'],
  ['student', '學生'],
])('the %s account button carries its role tag', async (role, tag) => {
  serverAccount = { account_role: role }
  open('/')
  const trigger = await screen.findByRole('button', { name: '帳號選單' })
  expect(within(trigger).getByText(tag)).toBeInTheDocument()
})

// 新路由器掛的頁面在路由器內切換：整頁重載會先露出深色底與載入畫面，看起來像黑屏閃一下
test.each([
  ['/teach/courses/c-1', '首頁', '/'],
])('sidebar %s → %s switches without a page load', async (url, label, target) => {
  open(url)
  await act(async () => { fireEvent.click(await screen.findByRole('link', { name: label })) })
  expect(screen.getByTestId('where').textContent).toBe(target)
})

test('brand link goes home without a page load', async () => {
  open('/groups')
  await screen.findByRole('navigation', { name: '主選單' })
  await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Socrates Classroom' })) })
  expect(screen.getByTestId('where').textContent).toBe('/')
})

test.each([
  ['/', '首頁'],
  ['/learn/courses/c-1', '首頁'],
  ['/teach/activities/a-1/edit', '首頁'],
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

// 登入、驗證頁用的語言下拉也要寫回帳號，外框跟著換語言
test('changing language saves it to the account', async () => {
  open('/teacher/home', <LanguageSwitcher />)
  fireEvent.change(await screen.findByLabelText('語言'), { target: { value: 'en' } })
  await waitFor(() => expect(api).toHaveBeenCalledWith('/account/locale', 'PUT', { locale: 'en' }))
  expect(await screen.findByRole('navigation', { name: 'Main menu' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Question store' })).toBeInTheDocument()
  await waitFor(() => expect(auth.account.locale).toBe('en'))
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

test.each(['/groups', '/teacher/home'])('%s highlights nothing (no groups item any more)', async (url) => {
  open(url)
  const nav = await screen.findByRole('navigation', { name: '主選單' })
  expect(within(nav).queryAllByRole('link').filter(link => link.getAttribute('aria-current'))).toHaveLength(0)
})

// P29：老師手機不變：頂部列＋頭像選單，選單裡只有個人設定、語言、登出（畫布 RoleTeacherPhoneMenu）
test('a teacher phone keeps the top bar and avatar menu, with no nav items', async () => {
  phone()
  open('/')
  const menu = await openAccountMenu()
  expect(screen.queryByRole('navigation', { name: '主選單' })).toBeNull()
  expect(within(menu).getAllByRole('menuitem').map(item => item.textContent?.replace(/ — .*/, '')))
    .toEqual(['個人設定', '語言', '登出'])
})

function CoursePage() {
  useShellBack('/', '首頁')
  return <p>course-page</p>
}

// P24：學生手機：頂部列沒有頭像；最下方底部導覽「首頁」「我」
describe('student phone', () => {
  beforeEach(() => { phone(); asStudent() })

  test('home has the brand on top, no avatar, and the bottom nav', async () => {
    open('/')
    const nav = await screen.findByRole('navigation', { name: '主選單' })
    expect(within(nav).getByRole('link', { name: '首頁' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('button', { name: '我' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('link', { name: 'Socrates Classroom' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '帳號選單' })).toBeNull()
  })

  test('an inner page shows back and page name on top and keeps the bottom nav', async () => {
    open('/learn/courses/c-1', <CoursePage />)
    const links = await screen.findAllByRole('link', { name: '首頁' })
    const back = links.find(link => link.closest('header'))
    expect(back).toHaveAttribute('href', '/')
    const nav = screen.getByRole('navigation', { name: '主選單' })
    expect(within(nav).getByRole('link', { name: '首頁' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('link', { name: 'Socrates Classroom' })).toBeNull()
  })

  test('我 opens the account sheet; Escape closes it and gives focus back', async () => {
    open('/')
    const me = await screen.findByRole('button', { name: '我' })
    await act(async () => { fireEvent.click(me) })
    const sheet = screen.getByRole('dialog', { name: '帳號' })
    expect(me).toHaveAttribute('aria-expanded', 'true')
    expect(within(sheet).getByText('Fizzy')).toBeInTheDocument()
    expect(within(sheet).getByText('學生')).toBeInTheDocument()
    expect(within(sheet).getByText('fizzy@example.org')).toBeInTheDocument()
    expect(within(sheet).getAllByRole('button').map(item => item.textContent?.replace(/繁體中文$/, '')))
      .toEqual(['個人設定', '語言', '登出'])
    fireEvent.keyDown(sheet, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(me).toHaveFocus()
  })

  test('the sheet goes to personal settings and logs out', async () => {
    open('/')
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: '我' })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '個人設定' })) })
    expect(screen.getByTestId('where')).toHaveTextContent('/account')
    expect(screen.queryByRole('dialog')).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '我' })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '登出' })) })
    expect(api).toHaveBeenCalledWith('/auth/logout', 'POST')
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login'))
  })

  // P25：頁面內的文字輸入框取得焦點時藏起底部導覽（Android 鍵盤會把固定在底部的元素頂上來）
  test('the bottom nav hides while a text field has focus', async () => {
    open('/', <><input aria-label="課程代碼" /><input type="checkbox" aria-label="勾選" /></>)
    await screen.findByRole('navigation', { name: '主選單' })
    act(() => { screen.getByLabelText('課程代碼').focus() })
    expect(screen.queryByRole('navigation', { name: '主選單' })).toBeNull()
    act(() => { screen.getByLabelText('課程代碼').blur() })
    expect(screen.getByRole('navigation', { name: '主選單' })).toBeInTheDocument()
    act(() => { screen.getByLabelText('勾選').focus() })
    expect(screen.getByRole('navigation', { name: '主選單' })).toBeInTheDocument()
  })

  test('the bottom nav comes back when the page with the focused field goes away', async () => {
    function Joining() {
      const navigate = useNavigate()
      const { pathname } = useLocation()
      return pathname === '/'
        ? <form onSubmit={event => { event.preventDefault(); navigate('/learn/courses/c-1') }}><input aria-label="課程代碼" /><button>加入</button></form>
        : <p>course</p>
    }
    open('/', <Joining />)
    await screen.findByRole('navigation', { name: '主選單' })
    act(() => { screen.getByLabelText('課程代碼').focus() })
    expect(screen.queryByRole('navigation', { name: '主選單' })).toBeNull()
    await act(async () => { fireEvent.submit(screen.getByLabelText('課程代碼').closest('form')!) })
    expect(await screen.findByText('course')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '主選單' })).toBeInTheDocument()
  })

  test('the sheet switches language', async () => {
    open('/')
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: '我' })) })
    // 畫布 S2sm：語言列右邊「繁體中文 ›」，看得出可以展開；箭頭不進可及名稱
    const row = screen.getByRole('button', { name: /^語言/ })
    expect(row.querySelector('.account-sheet__chevron')).toHaveAttribute('aria-hidden', 'true')
    expect(row).toHaveAccessibleName('語言 繁體中文')
    await act(async () => { fireEvent.click(row) })
    expect(row).toHaveAttribute('aria-expanded', 'true')
    await act(async () => { fireEvent.click(screen.getByRole('menuitemradio', { name: 'English' })) })
    await waitFor(() => expect(api).toHaveBeenCalledWith('/account/locale', 'PUT', { locale: 'en' }))
    expect(await screen.findByRole('navigation', { name: 'Main menu' })).toBeInTheDocument()
  })
})

// P27、P34：訪客的帳號面板（手機 S2gm）與帳號選單（電腦 G14）：沒有個人設定，入口先接「開發中」，登出先確認（G15）
describe('guest account', () => {
  beforeEach(() => { asGuest() })

  test('the phone sheet shows the guest tag, the date, and the two entries', async () => {
    phone()
    open('/')
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: '我' })) })
    const sheet = screen.getByRole('dialog', { name: '帳號' })
    expect(within(sheet).getByText('訪客')).toBeInTheDocument()
    expect(within(sheet).getByText('保留到 11/20')).toBeInTheDocument()
    expect(within(sheet).getByText('訪客只在這個瀏覽器有效；換裝置或清除瀏覽器資料後，紀錄無法找回。')).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: '個人設定' })).toBeNull()
    expect(within(sheet).getByRole('link', { name: '註冊以保留紀錄' })).toHaveAttribute('href', '/guest/register')
    expect(within(sheet).getByRole('link', { name: '已有帳號？登入' })).toHaveAttribute('href', '/guest/login')
  })

  test('a guest without an expiry date shows no date line', async () => {
    phone()
    serverAccount = { ...serverAccount, guest_expires_at: null }
    open('/')
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: '我' })) })
    expect(within(screen.getByRole('dialog', { name: '帳號' })).queryByText(/保留到/)).toBeNull()
  })

  test('logging out asks first: cancel stays, register first goes to the register entry', async () => {
    phone()
    open('/')
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: '我' })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '登出' })) })
    const confirm = screen.getByRole('dialog', { name: '要登出訪客身分嗎？' })
    // 照組員 Figma 的 G15：說明一句，先註冊在上、仍要登出在下
    expect(within(confirm).getByText('登出後，這個訪客身分與紀錄將無法找回。建議先註冊，保留課程和對話。')).toBeInTheDocument()
    expect(within(confirm).getAllByRole('button').map(button => button.textContent)).toEqual(['×', '先註冊', '仍要登出'])
    expect(api).not.toHaveBeenCalledWith('/auth/logout', 'POST')
    await act(async () => { fireEvent.click(within(confirm).getByRole('button', { name: '關閉' })) })
    expect(screen.queryByRole('dialog', { name: '要登出訪客身分嗎？' })).toBeNull()
    expect(screen.getByTestId('where')).toHaveTextContent('/')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '我' })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '登出' })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '先註冊' })) })
    expect(screen.getByTestId('where')).toHaveTextContent('/guest/register')
    expect(api).not.toHaveBeenCalledWith('/auth/logout', 'POST')
  })

  test('logging out anyway ends the guest session', async () => {
    open('/')
    const menu = await openAccountMenu()
    await act(async () => { fireEvent.click(within(menu).getByRole('menuitem', { name: '登出' })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '仍要登出' })) })
    expect(api).toHaveBeenCalledWith('/auth/logout', 'POST')
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login'))
  })

  test('the desktop menu has the same guest entries and no personal settings', async () => {
    open('/')
    const trigger = await screen.findByRole('button', { name: '帳號選單' })
    expect(within(trigger).getByText('訪客')).toBeInTheDocument()
    const menu = await openAccountMenu()
    expect(within(menu).getAllByRole('menuitem').map(item => item.textContent?.replace(/ — .*/, '')))
      .toEqual(['註冊以保留紀錄', '已有帳號？登入', '語言', '登出'])
    expect(screen.getAllByText('保留到 11/20').length).toBeGreaterThan(0)
    await act(async () => { fireEvent.click(within(menu).getByRole('menuitem', { name: '註冊以保留紀錄' })) })
    expect(screen.getByTestId('where')).toHaveTextContent('/guest/register')
  })
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
