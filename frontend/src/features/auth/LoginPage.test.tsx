import fs from 'node:fs'
import path from 'node:path'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { ApiError, api } from '../../contract/classroomClient'
import { AuthProvider } from './AuthContext'
import { AppRoutes } from '../../app/routes'
import { applyLocale } from '../../i18n'
import { readableText } from './testText'
import { keepPasswordChars, PASSWORD_SPECIALS, passwordOk, REGISTER_LIMITS, registerProblems } from './registerChecks'
import type { Locale } from '../../i18n/locale'

const PASSWORD_RULE_TEXT = '密碼需 8–32 個字元，並包含大寫字母、小寫字母、數字與特殊字元（可用 ! @ # $ % ^ & * _ - + = . ? ~），不能有空白或其他符號。'
const PASSWORD_HINT_TEXT = '密碼 8–32 個字元，需含大寫、小寫字母、數字和符號。'
const VERIFY_NOTE_TEXT = '註冊後會寄一封驗證信到你的 Email。'

jest.mock('../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../contract/classroomClient')>('../../contract/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})
jest.mock('../classroom-stage/Arena', () => ({ Arena: () => null }))
jest.mock('../group-dialogue/GroupClassroom', () => ({ GroupClassroomGate: () => null }))
jest.mock('../ai-settings/ProviderSettings', () => ({ ProviderSettings: () => null }))

const account = { id: 'u-1', username: 'Fizzy', verified: true, csrf_token: 'csrf', locale: 'zh-Hant' }
const CJK = /[㐀-鿿]/

// 舊頁直接讀 window.location，所以用 BrowserRouter 從真的網址開始
function openApp(url: string) {
  window.history.replaceState({}, '', url)
  render(<BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter>)
}

function anonymous(extra: (url: string, body?: unknown) => unknown = () => []) {
  jest.mocked(api).mockImplementation(async (url: string, _method?: string, body?: unknown) => {
    if (url === '/auth/me') throw new ApiError(401, 'LOGIN_REQUIRED')
    return extra(url, body)
  })
}

const submit = async (name: string) => {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}

beforeEach(() => jest.mocked(api).mockReset())

// 未登入時打開 /teacher/home?view=bank 書籤，登入後要回到題庫分頁，不能只剩 /teacher/home
test('login returns to the full teacher bookmark, query included', async () => {
  anonymous(url => (url === '/auth/login' ? { ...account, account_role: 'teacher' } : []))
  openApp('/teacher/home?view=bank#teacher-content')

  fireEvent.change(await screen.findByLabelText('使用者名稱或 Email'), { target: { value: 'Fizzy' } })
  fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'secret' } })
  await submit('登入')

  await waitFor(() => expect(api).toHaveBeenCalledWith('/auth/login', 'POST', { login: 'Fizzy', password: 'secret' }))
  await waitFor(() => expect(window.location.pathname + window.location.search + window.location.hash).toBe('/teacher/home?view=bank#teacher-content'))
  expect(await screen.findByRole('link', { name: /個人題庫/ })).toHaveAttribute('aria-current', 'page')
})

async function openRegister() {
  anonymous()
  openApp('/login')
  fireEvent.click(await screen.findByRole('button', { name: '註冊' }))
  return {
    username: screen.getByLabelText('使用者名稱'),
    email: screen.getByLabelText('Email'),
    password: screen.getByLabelText('密碼'),
  }
}

function fill(f: Awaited<ReturnType<typeof openRegister>>, username: string, email: string, password: string, role: string | null = '我是學生') {
  fireEvent.change(f.username, { target: { value: username } })
  fireEvent.change(f.email, { target: { value: email } })
  fireEvent.change(f.password, { target: { value: password } })
  if (role) fireEvent.click(screen.getByRole('radio', { name: new RegExp(role) }))
}

function phoneWidth() {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: (query: string) => ({
    matches: query === '(max-width: 767px)', media: query, addEventListener: () => {}, removeEventListener: () => {},
  }) })
}
const desktopMatchMedia = window.matchMedia
afterEach(() => { Object.defineProperty(window, 'matchMedia', { configurable: true, value: desktopMatchMedia }) })

describe('account role on register (P11–P13)', () => {
  test('nothing is chosen at first; submitting without a role explains it and sends nothing', async () => {
    const f = await openRegister()
    const group = screen.getByRole('group', { name: /身分/ })
    expect(within(group).getByRole('radio', { name: /我是學生/ })).not.toBeChecked()
    expect(within(group).getByRole('radio', { name: /我是老師/ })).not.toBeChecked()
    expect(within(group).getByText('註冊後不能更改。')).toBeInTheDocument()
    fill(f, 'goose', 'a@b.co', 'Socratic-123456', null)
    await submit('註冊')
    expect(screen.getByRole('alert')).toHaveTextContent('請選擇身分')
    expect(screen.getByText('請選擇身分')).toHaveAttribute('id', 'register-account_role-error')
    expect(within(group).getByRole('radio', { name: /我是學生/ })).toHaveFocus()
    expect(api).not.toHaveBeenCalledWith('/auth/register', 'POST', expect.anything())
  })

  test('each role option carries its own person icon, hidden from the accessible name', async () => {
    await openRegister()
    for (const [name, kind] of [[/我是學生/, 'student'], [/我是老師/, 'teacher']] as const) {
      const option = screen.getByRole('radio', { name }).closest('label')!
      const icon = option.querySelector(`svg.auth-role__icon--${kind}`)
      expect(icon).not.toBeNull()
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    }
    expect(screen.getByRole('radio', { name: /我是學生/ })).toHaveAccessibleName('我是學生')
  })

  test('the chosen role is sent with the registration', async () => {
    const f = await openRegister()
    fill(f, 'goose', 'a@b.co', 'Socratic-123456', '我是老師')
    expect(screen.queryByText('請選擇身分')).toBeNull()
    await submit('註冊')
    expect(api).toHaveBeenCalledWith('/auth/register', 'POST', {
      username: 'goose', email: 'a@b.co', password: 'Socratic-123456', account_role: 'teacher',
    })
  })

  test('the role survives a trip to login and forgot password', async () => {
    await openRegister()
    fireEvent.click(screen.getByRole('radio', { name: /我是老師/ }))
    fireEvent.click(screen.getByRole('button', { name: '回到登入' }))
    fireEvent.click(await screen.findByRole('button', { name: '忘記密碼' }))
    fireEvent.click(await screen.findByRole('button', { name: '註冊' }))
    expect(await screen.findByRole('radio', { name: /我是老師/ })).toBeChecked()
  })

  test('on a phone the teacher option says it is for computers', async () => {
    phoneWidth()
    await openRegister()
    expect(screen.getByRole('radio', { name: /我是老師/ })).toHaveAccessibleName(/限電腦使用/)
    fireEvent.click(screen.getByRole('radio', { name: /我是老師/ }))
    expect(screen.getByText('老師功能請用電腦登入使用；註冊後不能更改。')).toBeInTheDocument()
  })

  test.each([
    ['course invite', '/join?code=AB12'],
    ['activity QR', '/activities/a-1/join?from=qr'],
  ])('registering from a %s has no choice and makes a student', async (_, next) => {
    anonymous()
    openApp('/login?mode=register&next=' + encodeURIComponent(next))
    const f = {
      username: await screen.findByLabelText('使用者名稱'),
      email: screen.getByLabelText('Email'),
      password: screen.getByLabelText('密碼'),
    }
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.getByText('從課程 QR 或邀請連結註冊的是學生帳號。')).toBeInTheDocument()
    fill(f, 'goose', 'a@b.co', 'Socratic-123456', null)
    await submit('註冊')
    expect(api).toHaveBeenCalledWith('/auth/register', 'POST', {
      username: 'goose', email: 'a@b.co', password: 'Socratic-123456', account_role: 'student',
    })
  })

  test('a 422 on account_role lands under the role choice', async () => {
    const f = await openRegister()
    anonymous(url => {
      if (url === '/auth/register') throw new ApiError(422, [{ type: 'literal_error', loc: ['body', 'account_role'], msg: 'x' }])
      return []
    })
    fill(f, 'goose', 'a@b.co', 'Socratic-123456')
    await submit('註冊')
    expect(screen.getByText('請選擇身分')).toHaveAttribute('id', 'register-account_role-error')
  })
})

// 123@g 被瀏覽器的 type=email 放行；送出前就要在 Email 欄位下說明，並把焦點移到該欄位
test('register pre-checks the email domain and explains it under the field', async () => {
  const f = await openRegister()
  fill(f, 'goose', '123@g', 'Socratic-123456')
  await submit('註冊')
  expect(screen.getByText('Email 格式不正確，請重新輸入。')).toHaveAttribute('id', 'register-email-error')
  expect(f.email).toHaveAttribute('aria-invalid', 'true')
  expect(f.email).toHaveAccessibleDescription('Email 格式不正確，請重新輸入。')
  expect(f.email).toHaveFocus()
  expect(api).not.toHaveBeenCalledWith('/auth/register', 'POST', expect.anything())
  fireEvent.change(f.email, { target: { value: '123@g.co' } })
  expect(screen.queryByText('Email 格式不正確，請重新輸入。')).toBeNull()
})

test('register pre-checks username and password with the backend limits', async () => {
  const f = await openRegister()
  fill(f, 'a b', 'a@b.co', 'short')
  await submit('註冊')
  expect(screen.getByText(/使用者名稱只能用英文字母、數字/)).toBeInTheDocument()
  expect(screen.getByText('密碼至少要 8 個字元，請重新輸入。')).toBeInTheDocument()
  expect(f.username).toHaveFocus()
  fill(f, 'ab', 'a@b.co', 'Socratic-1')
  await submit('註冊')
  expect(screen.getByText('使用者名稱至少要 3 個字元，請重新輸入。')).toBeInTheDocument()
  expect(registerProblems({ username: 'ab', email: 'a@b.co', password: 'Socratic-1' })).toEqual([
    { field: 'username', kind: 'tooShort', min: 3 },
  ])
  expect(registerProblems({ username: 'goose', email: 'a@b.co', password: 'Socratic-1' })).toEqual([])
  expect(registerProblems({ username: '張三豐', email: 'a@b.co', password: 'Socratic-1' })[0].field).toBe('username')
})

test('register asks for upper, lower, digit and an allowed special character', async () => {
  const f = await openRegister()
  // 欄位下是精簡版；完整規則（含可用符號）只在送出不符時的錯誤裡
  const rule = screen.getByText(PASSWORD_HINT_TEXT)
  expect(rule).toHaveAttribute('id', 'password-rule')
  expect(screen.queryByText(PASSWORD_RULE_TEXT)).toBeNull()
  expect(f.password).toHaveAttribute('aria-describedby', 'password-rule')
  for (const weak of ['socratic-1', 'SOCRATIC-1', 'Socratic-x', 'Socratic12', "Socratic-1'", 'Socratic 1-a'])
    expect(passwordOk(weak)).toBe(false)
  for (const c of PASSWORD_SPECIALS) expect(passwordOk(`Socratic1${c}`)).toBe(true)
  expect(registerProblems({ username: 'goose', email: 'a@b.co', password: 'Socratic12' })).toEqual([
    { field: 'password', kind: 'policy' },
  ])
  expect(registerProblems({ username: 'goose', email: 'a@b.co', password: 'Ab-1' + 'a'.repeat(29) })).toEqual([
    { field: 'password', kind: 'tooLong', max: 32 },
  ])
  fill(f, 'goose', 'a@b.co', 'Socratic12')
  await submit('註冊')
  expect(screen.getByRole('alert')).toHaveTextContent(PASSWORD_RULE_TEXT)
  // 錯誤取代欄位下的說明，同一段規則不出現兩次（跟身分欄一樣）
  expect(screen.queryByText(PASSWORD_HINT_TEXT)).toBeNull()
  expect(f.password).toHaveAttribute('aria-describedby', 'register-password-error')
  // 錯誤緊貼欄位，驗證信說明排在錯誤後面
  const error = screen.getByRole('alert')
  expect(error.compareDocumentPosition(screen.getByText(VERIFY_NOTE_TEXT)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(api).not.toHaveBeenCalledWith('/auth/register', 'POST', expect.anything())
  fireEvent.change(f.password, { target: { value: 'Socratic-12' } })
  expect(screen.getByText(PASSWORD_HINT_TEXT)).toHaveAttribute('id', 'password-rule')
  expect(f.password).toHaveAttribute('aria-describedby', 'password-rule')
})

test('the verification-email note sits right under the password rule, above the role choice', async () => {
  await openRegister()
  const rule = screen.getByText(PASSWORD_HINT_TEXT)
  const verify = screen.getByText(VERIFY_NOTE_TEXT)
  const role = screen.getByRole('group', { name: /身分/ })
  expect(rule.compareDocumentPosition(verify) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(verify.compareDocumentPosition(role) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getAllByText(VERIFY_NOTE_TEXT)).toHaveLength(1)
})

test('reset shows the short password rule but not the verification-email note', async () => {
  anonymous()
  openApp('/login?mode=reset&token=tok-1')
  expect(await screen.findByText(PASSWORD_HINT_TEXT)).toHaveAttribute('id', 'password-rule')
  expect(screen.queryByText(VERIFY_NOTE_TEXT)).toBeNull()
})

test('a password_policy 422 from the server shows the password rule under the field', async () => {
  const f = await openRegister()
  anonymous(url => {
    if (url === '/auth/register') throw new ApiError(422, [{ type: 'password_policy', loc: ['body', 'password'], msg: 'x' }])
    return []
  })
  fill(f, 'goose', 'a@b.co', 'Socratic-123456')
  await submit('註冊')
  expect(screen.getByRole('alert')).toHaveTextContent(PASSWORD_RULE_TEXT)
  expect(f.password).toHaveFocus()
})

test('characters outside the allowed set never enter the new-password box', async () => {
  const f = await openRegister()
  fireEvent.change(f.password, { target: { value: `Ab1!<x>"'y z` } })
  expect(f.password).toHaveValue('Ab1!xyz')
  expect(screen.getByText(/已擋下不允許的字元：< > " ' 空白/)).toBeInTheDocument()
  expect(f.password).toHaveAttribute('maxLength', '32')
  expect(keepPasswordChars('A'.repeat(40)).kept).toHaveLength(32)
  expect(PASSWORD_SPECIALS).not.toMatch(/[<>"']/)
})

test('login still accepts long passwords set under the old rule', async () => {
  anonymous()
  openApp('/login')
  const password = await screen.findByLabelText('密碼')
  expect(password).toHaveAttribute('maxLength', '256')
  expect(password).not.toHaveAttribute('aria-describedby')
})

test('login keeps whatever the user types (old passwords)', async () => {
  anonymous()
  openApp('/login')
  const password = await screen.findByLabelText('密碼')
  fireEvent.change(password, { target: { value: 'old pass <with> quotes"' } })
  expect(password).toHaveValue('old pass <with> quotes"')
  expect(screen.queryByText(/已擋下/)).toBeNull()
})

test('reset checks the password rule before sending the token', async () => {
  anonymous()
  openApp('/login?mode=reset&token=tok-weak')
  fireEvent.change(await screen.findByLabelText('新密碼'), { target: { value: 'weakpassword' } })
  await submit('設定新密碼')
  expect(screen.getByRole('alert')).toHaveTextContent(PASSWORD_RULE_TEXT)
  expect(api).not.toHaveBeenCalledWith('/auth/reset-password', 'POST', expect.anything())
})

const identityContracts = path.resolve(__dirname, '../../../../backend/app/modules/identity_access/contracts.py')
const withBackend = fs.existsSync(identityContracts) ? test : test.skip

withBackend('register limits match the backend Register contract', () => {
  const source = fs.readFileSync(identityContracts, 'utf8')
  // 帳密三欄在 Credentials（Register 與訪客升級共用），Register 另加 account_role
  const register = source.match(/class Credentials\(Strict\):([\s\S]*?)\n\n/)?.[1] || ''
  expect(source).toMatch(/class Register\(Credentials\):\n[\s\S]*?account_role: AccountRole \| None = None/)
  expect(source).toContain('AccountRole = Literal["student", "teacher"]')
  for (const field of ['username', 'email', 'password'] as const) {
    const line = register.match(new RegExp(`${field}: str = Field\\(([^)]*)\\)`))?.[1] || ''
    expect([Number(line.match(/min_length=(\d+)/)?.[1]), Number(line.match(/max_length=(\d+)/)?.[1])]).toEqual([...REGISTER_LIMITS[field]])
  }
  expect(source.match(/PASSWORD_SPECIALS = "([^"]*)"/)?.[1]).toBe(PASSWORD_SPECIALS)
  expect(source).toContain('USERNAME_PATTERN = r"^[A-Za-z][A-Za-z0-9_.-]*[A-Za-z0-9]$"')
  // 中文的密碼規則逐字等於後端 PASSWORD_RULE（f-string 展開後）
  const [min, max] = REGISTER_LIMITS.password
  expect(source).toContain('f"密碼需 {PASSWORD_MIN}–{PASSWORD_MAX} 個字元，並包含大寫字母、小寫字母、數字與特殊字元"')
  expect(PASSWORD_RULE_TEXT).toBe(`密碼需 ${min}–${max} 個字元，並包含大寫字母、小寫字母、數字與特殊字元（可用 ${PASSWORD_SPECIALS.split('').join(' ')}），不能有空白或其他符號。`)
})

test('a 422 from the server lands under the matching register field', async () => {
  const f = await openRegister()
  anonymous(url => {
    if (url === '/auth/register')
      throw new ApiError(422, [{ type: 'string_too_long', loc: ['body', 'username'], msg: 'x', ctx: { max_length: 64 } }])
    return []
  })
  fill(f, 'goose', 'a@b.co', 'Socratic-123456')
  await submit('註冊')
  expect(screen.getByText('使用者名稱最多 64 個字元，請重新輸入。')).toHaveAttribute('id', 'register-username-error')
  expect(f.username).toHaveFocus()
})

// 使用者名稱／Email 被占用時，錯誤放在該欄位；等待驗證中的帳號在表單說明何時釋出、如何重寄
test('register conflicts land under the taken field or explain the pending verification', async () => {
  const f = await openRegister()
  let reply = 'USERNAME_TAKEN'
  anonymous(url => {
    if (url === '/auth/register') throw new ApiError(409, reply)
    return []
  })
  fill(f, 'goose', 'a@b.co', 'Socratic-123456')
  await submit('註冊')
  expect(screen.getByText('這個使用者名稱已經有人使用，請換一個。')).toHaveAttribute('id', 'register-username-error')
  expect(f.username).toHaveFocus()

  reply = 'EMAIL_TAKEN'
  await submit('註冊')
  expect(screen.getByText(/這個 Email 已經註冊過了/)).toHaveAttribute('id', 'register-email-error')
  expect(f.email).toHaveFocus()

  reply = 'ACCOUNT_PENDING_VERIFICATION'
  fireEvent.change(f.email, { target: { value: 'c@d.co' } })
  await submit('註冊')
  expect(screen.getByRole('status')).toHaveTextContent('等驗證連結過期')
  expect(screen.getByRole('status')).toHaveTextContent('重新寄送驗證信')
})

test('forgot password confirms without revealing whether the email exists', async () => {
  anonymous(url => (url === '/auth/forgot-password' ? { status: 'QUEUED', message: '後端的中文訊息' } : []))
  openApp('/login?mode=forgot')
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'a@b.co' } })
  await submit('寄出重設信')
  expect(api).toHaveBeenCalledWith('/auth/forgot-password', 'POST', { email: 'a@b.co' })
  expect(screen.getByRole('status')).toHaveTextContent('如果這個 Email 有註冊過')
  expect(screen.queryByText('後端的中文訊息')).toBeNull()
})

test('reset mode sets a new password with the token and returns to login', async () => {
  anonymous(url => (url === '/auth/reset-password' ? { status: 'PASSWORD_RESET' } : []))
  openApp('/login?mode=reset&token=tok-1')
  fireEvent.change(await screen.findByLabelText('新密碼'), { target: { value: 'Brand-new-pass-1' } })
  await submit('設定新密碼')
  expect(api).toHaveBeenCalledWith('/auth/reset-password', 'POST', { token: 'tok-1', password: 'Brand-new-pass-1' })
  expect(await screen.findByRole('heading', { name: '歡迎回來' })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('密碼已經更新')
  expect(window.location.search).not.toContain('tok-1')
})

test('a signed-in account can still use a one-time reset link', async () => {
  let signedIn = true
  jest.mocked(api).mockImplementation(async (url: string) => {
    if (url === '/auth/me') {
      if (signedIn) return account
      throw new ApiError(401, 'LOGIN_REQUIRED')
    }
    if (url === '/auth/reset-password') {
      signedIn = false
      return { status: 'PASSWORD_RESET' }
    }
    return []
  })
  openApp('/login?mode=reset&token=tok-signed-in')

  fireEvent.change(await screen.findByLabelText('新密碼'), { target: { value: 'Brand-new-pass-2' } })
  await submit('設定新密碼')

  expect(api).toHaveBeenCalledWith('/auth/reset-password', 'POST', {
    token: 'tok-signed-in',
    password: 'Brand-new-pass-2',
  })
  expect(await screen.findByRole('heading', { name: '歡迎回來' })).toBeInTheDocument()
  expect(window.location.search).not.toContain('tok-signed-in')
})

test('switches language on the login page', async () => {
  anonymous()
  openApp('/login')
  fireEvent.change(await screen.findByLabelText('語言'), { target: { value: 'en' } })
  expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  expect(localStorage.getItem('socrates.locale')).toBe('en')
})

// 英文與西文頁面不能露出任何後端或舊表的中文
describe.each<Locale>(['en', 'es'])('no Chinese leaks on the %s login page', locale => {
  beforeEach(async () => { await applyLocale(locale) })

  // 「問」印章是 aria-hidden 的品牌圖形，不算給人讀的文字
  const noChinese = () => expect(readableText(screen.getByRole('main'))).not.toMatch(CJK)

  test('wrong credentials', async () => {
    anonymous(url => { if (url === '/auth/login') throw new ApiError(401, 'AUTH_INVALID_CREDENTIALS'); return [] })
    openApp('/login')
    const inputs = await screen.findAllByRole('textbox')
    fireEvent.change(inputs[0], { target: { value: 'someone' } })
    fireEvent.change(document.querySelector('input[type=password]'), { target: { value: 'nope-nope' } })
    await act(async () => { fireEvent.submit(document.querySelector('form')) })
    expect(screen.getByRole('status').textContent).not.toBe('')
    noChinese()
  })

  test('register 422 and username pre-check', async () => {
    anonymous(url => {
      if (url === '/auth/register') throw new ApiError(422, [{ type: 'string_too_long', loc: ['body', 'email'], msg: '中文訊息', ctx: { max_length: 254 } }])
      return []
    })
    openApp('/login?mode=register')
    const [username, email] = await screen.findAllByRole('textbox')
    fireEvent.change(username, { target: { value: 'a b' } })
    fireEvent.change(email, { target: { value: 'a@b.co' } })
    fireEvent.change(document.querySelector('input[type=password]'), { target: { value: 'Socratic-123456' } })
    await act(async () => { fireEvent.submit(document.querySelector('form')) })
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
    noChinese()
    fireEvent.change(username, { target: { value: 'goose' } })
    await act(async () => { fireEvent.submit(document.querySelector('form')) })
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
    noChinese()
  })
})

describe('J0: login reached from an invite or activity QR', () => {
  test('join login shows course name from public preview', async () => {
    anonymous(url => (url === '/course-join/public-preview?code=AB12' ? { course_name: '哲學導論' } : []))
    openApp('/login?next=' + encodeURIComponent('/join?code=AB12'))
    expect(await screen.findByText('正在加入：哲學導論')).toBeInTheDocument()
    expect(screen.getByText('由課程 QR Code 進入')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '加入課程' })).toBeInTheDocument()
    expect(screen.queryByText(/掃描成功/)).toBeNull()
    expect(screen.getByRole('button', { name: '登入並加入課程' })).toBeInTheDocument()
    expect(screen.getByText('註冊完成後，也會自動回到這門課。')).toBeInTheDocument()
  })

  test('activity QR uses the activity preview and a neutral button', async () => {
    anonymous(url => (url === '/activities/a-1/public-preview' ? { course_name: '哲學導論' } : []))
    openApp('/login?next=' + encodeURIComponent('/activities/a-1/join?from=qr'))
    expect(await screen.findByText('正在加入：哲學導論')).toBeInTheDocument()
    expect(screen.getByText('由活動 QR Code 進入')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '加入活動' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '登入並加入活動' })).toBeInTheDocument()
    expect(screen.getByText('註冊完成後，也會自動回到這個活動。')).toBeInTheDocument()
  })

  test('join login without course name still logs in', async () => {
    anonymous(url => {
      if (url === '/course-join/public-preview?code=AB12') throw new ApiError(404, 'ENROLL_CODE_NOT_FOUND')
      if (url === '/auth/login') return account
      if (url === '/course-join/preview?code=AB12') throw new ApiError(404, 'ENROLL_CODE_NOT_FOUND')
      return []
    })
    openApp('/login?next=' + encodeURIComponent('/join?code=AB12'))
    expect(await screen.findByText('由課程 QR Code 進入')).toBeInTheDocument()
    expect(screen.queryByText(/正在加入/)).toBeNull()
    fireEvent.change(screen.getByLabelText('使用者名稱或 Email'), { target: { value: 'Fizzy' } })
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'secret' } })
    await submit('登入並加入課程')
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe('/join?code=AB12'))
  })

  test('register link keeps next and uses the normal register layout', async () => {
    anonymous(url => (url === '/course-join/public-preview?code=AB12' ? { course_name: '哲學導論' } : []))
    openApp('/login?next=' + encodeURIComponent('/join?code=AB12'))
    fireEvent.click(await screen.findByRole('button', { name: '還沒有帳號？註冊' }))
    expect(new URLSearchParams(window.location.search).get('mode')).toBe('register')
    expect(new URLSearchParams(window.location.search).get('next')).toBe('/join?code=AB12')
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  test('plain login keeps E1 layout', async () => {
    anonymous()
    openApp('/login?next=' + encodeURIComponent('/teacher/home'))
    expect(await screen.findByRole('button', { name: '登入' })).toBeInTheDocument()
    expect(screen.queryByText('由課程 QR Code 進入')).toBeNull()
  })
})

describe('test accounts (only where the server seeded them)', () => {
  const demo = {
    debug_mode: false,
    demo_login: { password: 'preview-password', accounts: [{ username: 'teacher001', role: 'teacher' }, { username: 'user001', role: 'student' }] },
  }
  const offering = (more: (url: string) => unknown = () => []) => anonymous(url => (url === '/public-config' ? demo : more(url)))

  test('a button fills the account and password but does not log in', async () => {
    offering()
    openApp('/login')
    const group = await screen.findByRole('group', { name: '測試帳號' })
    fireEvent.click(within(group).getByRole('button', { name: '老師 teacher001' }))
    expect(screen.getByLabelText('使用者名稱或 Email')).toHaveValue('teacher001')
    expect(screen.getByLabelText('密碼')).toHaveValue('preview-password')
    fireEvent.click(within(group).getByRole('button', { name: '學生 user001' }))
    expect(screen.getByLabelText('使用者名稱或 Email')).toHaveValue('user001')
    expect(jest.mocked(api).mock.calls.some(([url]) => url === '/auth/login')).toBe(false)
  })

  test('the join login offers them too', async () => {
    offering(url => (url === '/course-join/public-preview?code=AB12' ? { course_name: '哲學導論' } : []))
    openApp('/login?next=' + encodeURIComponent('/join?code=AB12'))
    expect(await screen.findByRole('group', { name: '測試帳號' })).toBeInTheDocument()
  })

  test('register and forgot never show them', async () => {
    offering()
    openApp('/login?mode=register')
    expect(await screen.findByLabelText('Email')).toBeInTheDocument()
    await act(async () => {})
    expect(screen.queryByRole('group', { name: '測試帳號' })).toBeNull()
  })

  test('nothing appears when the server offers none', async () => {
    anonymous(url => (url === '/public-config' ? { debug_mode: false, demo_login: null } : []))
    openApp('/login')
    expect(await screen.findByRole('button', { name: '登入' })).toBeInTheDocument()
    await act(async () => {})
    expect(screen.queryByRole('group', { name: '測試帳號' })).toBeNull()
  })
})
