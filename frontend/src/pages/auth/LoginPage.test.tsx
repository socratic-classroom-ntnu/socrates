import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { ApiError, api } from '../../api/classroomClient'
import { AuthProvider } from '../../app/AuthContext'
import { AppRoutes } from '../../app/routes'
import { applyLocale } from '../../i18n'
import { readableText } from './testText'
import type { Locale } from '../../i18n/locale'

jest.mock('../../api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../api/classroomClient')>('../../api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})
jest.mock('../../features/classroom-stage/Arena', () => ({ Arena: () => null }))
jest.mock('../GroupClassroom', () => ({ GroupClassroomGate: () => null }))
jest.mock('../ProviderSettings', () => ({ ProviderSettings: () => null }))

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
  anonymous(url => (url === '/auth/login' ? account : []))
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

function fill(f: Awaited<ReturnType<typeof openRegister>>, username: string, email: string, password: string) {
  fireEvent.change(f.username, { target: { value: username } })
  fireEvent.change(f.email, { target: { value: email } })
  fireEvent.change(f.password, { target: { value: password } })
}

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
  expect(screen.getByText(/使用者名稱只能用文字、數字/)).toBeInTheDocument()
  expect(screen.getByText('密碼至少要 12 個字元，請重新輸入。')).toBeInTheDocument()
  expect(f.username).toHaveFocus()
  fill(f, '張三', 'a@b.co', 'x'.repeat(12))
  await submit('註冊')
  expect(screen.getByText('使用者名稱至少要 3 個字元，請重新輸入。')).toBeInTheDocument()
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
