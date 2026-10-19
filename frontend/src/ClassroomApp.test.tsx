import fs from 'node:fs'
import path from 'node:path'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ClassroomApp from './ClassroomApp'
import { Home } from './features/student-classroom/StudentHome'
import { JOIN_ALIAS_MAX_LENGTH } from './contract/limits'
import { PASSWORD_SPECIALS, REGISTER_LIMITS, keepPasswordChars, passwordOk, registerProblems } from './features/entrance/Auth'
import { PASSWORD_RULE } from './contract/errorText'
import { ApiError, api } from './contract/classroomClient'

jest.mock('./contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('./contract/classroomClient')>('./contract/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})

// 3D 舞台與團體課堂與這裡的測試無關，jsdom 也載不了它們用到的 ESM（three、.mjs），換成空元件
jest.mock('./features/classroom-stage/Arena', () => ({ Arena: () => null }))
jest.mock('./features/group-dialogue/GroupClassroom', () => ({ GroupClassroomGate: () => null }))
jest.mock('./features/ai-settings/ProviderSettings', () => ({ ProviderSettings: () => null }))
jest.mock('./features/danmaku/Danmaku', () => ({ __esModule: true, default: () => <p>如果說謊能讓一個人免於痛苦，說謊是對的嗎？</p> }))

const account = { id: 'u-1', username: 'Fizzy', verified: true, csrf_token: 'csrf' }

beforeEach(() => {
  jest.mocked(api).mockReset()
  window.history.replaceState({}, '', '/')
})

// 加入表單的匿名名稱上限要和後端 JoinRoom.alias 一樣，否則 41～80 字會在送出後才被 422 擋下
test('the join form caps the alias at the backend limit', async () => {
  jest.mocked(api).mockResolvedValue([])
  render(<Home user={account} />)
  const alias = screen.getByLabelText('本次匿名名稱（選填）')
  expect(alias).toHaveAttribute('maxLength', String(JOIN_ALIAS_MAX_LENGTH))
  expect(JOIN_ALIAS_MAX_LENGTH).toBe(40)
  await waitFor(() => expect(api).toHaveBeenCalledWith('/classrooms'))
})

const classroomContracts = path.resolve(__dirname, '../../backend/app/modules/classroom_core/contracts.py')
const identityContracts = path.resolve(__dirname, '../../backend/app/modules/identity_access/contracts.py')
const withBackend = fs.existsSync(classroomContracts) && fs.existsSync(identityContracts) ? test : test.skip

withBackend('the alias limit matches JoinRoom.alias in the backend contract', () => {
  const source = fs.readFileSync(classroomContracts, 'utf8')
  const joinRoom = source.match(/class JoinRoom\(Strict\):([\s\S]*?)\n\n/)
  expect(joinRoom).not.toBeNull()
  const limit = joinRoom?.[1].match(/alias: str = Field\([^)]*max_length=(\d+)/)
  expect(Number(limit?.[1])).toBe(JOIN_ALIAS_MAX_LENGTH)
})

// 未登入時打開 /teacher/home?view=bank 書籤，登入後要回到題庫分頁，不能只剩 /teacher/home
test('login returns to the full teacher bookmark, query included', async () => {
  window.history.replaceState({}, '', '/teacher/home?view=bank#teacher-content')
  jest.mocked(api).mockImplementation(async (url: string) => {
    if (url === '/auth/me') throw new ApiError(401, 'AUTH_REQUIRED')
    if (url === '/auth/login') return account
    return []
  })
  render(<ClassroomApp />)

  fireEvent.change(await screen.findByLabelText('使用者名稱或 Email'), { target: { value: 'Fizzy' } })
  fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'secret' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '繼續' }))
  })

  await waitFor(() => expect(api).toHaveBeenCalledWith('/auth/login', 'POST', { login: 'Fizzy', password: 'secret' }))
  expect(window.location.pathname + window.location.search + window.location.hash).toBe('/teacher/home?view=bank#teacher-content')
  expect(await screen.findByRole('link', { name: /個人題庫/ })).toHaveAttribute('aria-current', 'page')
})

// 錯的課程代碼要說「找不到」，而且錯誤只留在加入卡片：改代碼或切換分頁就消失
test('a wrong course code says not found and the error stays scoped to the join card', async () => {
  jest.mocked(api).mockImplementation(async (url: string) => {
    if (url === '/classrooms/join') throw new ApiError(404, 'COURSE_CODE_NOT_FOUND')
    return []
  })
  render(<Home user={account} />)
  const code = screen.getByLabelText('課程代碼')
  fireEvent.change(code, { target: { value: 'ZZZZ9999' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '加入課堂 →' }))
  })
  const form = screen.getByRole('form', { name: '加入課堂' })
  expect(await screen.findByRole('alert')).toHaveTextContent('找不到這個課程代碼，請確認後再輸入。')
  expect(form).toContainElement(screen.getByRole('alert'))
  expect(code).toHaveAttribute('aria-invalid', 'true')

  fireEvent.change(code, { target: { value: 'ZZZZ999' } })
  expect(screen.queryByRole('alert')).toBeNull()

  fireEvent.change(code, { target: { value: 'ZZZZ9999' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '加入課堂 →' }))
  })
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'AI 連線設定' }))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByText('找不到這個課程代碼，請確認後再輸入。')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '加入與近期課堂' }))
  expect(screen.queryByRole('alert')).toBeNull()
})

test('an empty course code is blocked before any request', async () => {
  jest.mocked(api).mockResolvedValue([])
  render(<Home user={account} />)
  await waitFor(() => expect(api).toHaveBeenCalledWith('/classrooms'))
  expect(screen.getByRole('button', { name: '加入課堂 →' })).toBeDisabled()
  await act(async () => {
    fireEvent.submit(screen.getByRole('form', { name: '加入課堂' }))
  })
  expect(screen.getByRole('alert')).toHaveTextContent('請輸入課程代碼。')
  expect(api).not.toHaveBeenCalledWith('/classrooms/join', 'POST', expect.anything())
})

async function openRegister() {
  window.history.replaceState({}, '', '/teacher')
  jest.mocked(api).mockImplementation(async (url: string) => {
    if (url === '/auth/me') throw new ApiError(401, 'LOGIN_REQUIRED')
    return []
  })
  render(<ClassroomApp />)
  fireEvent.click(await screen.findByRole('button', { name: '註冊' }))
  return {
    username: screen.getByLabelText('使用者名稱'),
    email: screen.getByLabelText('Email'),
    password: screen.getByLabelText('密碼'),
  }
}

// 123@g 被瀏覽器的 type=email 放行；送出前就要在 Email 欄位下說明，並把焦點移到該欄位
test('register pre-checks the email domain and explains it under the field', async () => {
  const f = await openRegister()
  fireEvent.change(f.username, { target: { value: 'goose' } })
  fireEvent.change(f.email, { target: { value: '123@g' } })
  fireEvent.change(f.password, { target: { value: 'Socratic-123456' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '繼續' }))
  })
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
  fireEvent.change(f.username, { target: { value: 'a b' } })
  fireEvent.change(f.email, { target: { value: 'a@b.co' } })
  fireEvent.change(f.password, { target: { value: 'short' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '繼續' }))
  })
  expect(screen.getByText(/使用者名稱只能用英文字母、數字/)).toBeInTheDocument()
  expect(screen.getByText('密碼至少要 8 個字元，請重新輸入。')).toBeInTheDocument()
  expect(f.username).toHaveFocus()
  expect(registerProblems({ username: 'ab', email: 'a@b.co', password: 'Socratic-1' })).toEqual([
    { field: 'username', text: '使用者名稱至少要 3 個字元，請重新輸入。' },
  ])
  expect(registerProblems({ username: 'goose', email: 'a@b.co', password: 'Socratic-1' })).toEqual([])
  expect(registerProblems({ username: '張三豐', email: 'a@b.co', password: 'Socratic-1' })[0].field).toBe('username')
})

test('register asks for upper, lower, digit and an allowed special character', async () => {
  const f = await openRegister()
  expect(f.password).toHaveAttribute('aria-describedby', 'password-rule')
  expect(screen.getByText(PASSWORD_RULE)).toHaveAttribute('id', 'password-rule')
  for (const weak of ['socratic-1', 'SOCRATIC-1', 'Socratic-x', 'Socratic12', "Socratic-1'", 'Socratic 1-a'])
    expect(passwordOk(weak)).toBe(false)
  for (const c of PASSWORD_SPECIALS) expect(passwordOk(`Socratic1${c}`)).toBe(true)
  expect(registerProblems({ username: 'goose', email: 'a@b.co', password: 'Socratic12' })).toEqual([
    { field: 'password', text: PASSWORD_RULE },
  ])
  expect(registerProblems({ username: 'goose', email: 'a@b.co', password: 'Ab-1' + 'a'.repeat(29) })).toEqual([
    { field: 'password', text: '密碼最多 32 個字元，請重新輸入。' },
  ])
})

test('login still accepts long passwords set under the old rule', async () => {
  window.history.replaceState({}, '', '/student')
  jest.mocked(api).mockImplementation(async (url: string) => {
    if (url === '/auth/me') throw new ApiError(401, 'LOGIN_REQUIRED')
    return []
  })
  render(<ClassroomApp />)
  const password = await screen.findByLabelText('密碼')
  expect(password).toHaveAttribute('maxLength', '256')
  expect(password).not.toHaveAttribute('aria-describedby')
})

test('a 422 from the server lands under the matching register field', async () => {
  const f = await openRegister()
  jest.mocked(api).mockImplementation(async (url: string) => {
    if (url === '/auth/register')
      throw new ApiError(422, [{ type: 'string_too_long', loc: ['body', 'username'], msg: 'x', ctx: { max_length: 64 } }])
    return []
  })
  fireEvent.change(f.username, { target: { value: 'goose' } })
  fireEvent.change(f.email, { target: { value: 'a@b.co' } })
  fireEvent.change(f.password, { target: { value: 'Socratic-123456' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '繼續' }))
  })
  expect(screen.getByText('使用者名稱最多 64 個字元，請重新輸入。')).toHaveAttribute('id', 'register-username-error')
  expect(f.username).toHaveFocus()
  expect(screen.queryByText('有欄位內容不符合格式，請檢查後再試。')).toBeNull()
})

withBackend('register limits match the backend Register contract', () => {
  const source = fs.readFileSync(identityContracts, 'utf8')
  const register = source.match(/class Register\(Strict\):([\s\S]*?)\n\n/)?.[1] || ''
  for (const field of ['username', 'email', 'password'] as const) {
    const line = register.match(new RegExp(`${field}: str = Field\\(([^)]*)\\)`))?.[1] || ''
    expect([Number(line.match(/min_length=(\d+)/)?.[1]), Number(line.match(/max_length=(\d+)/)?.[1])]).toEqual([...REGISTER_LIMITS[field]])
  }
  expect(source.match(/PASSWORD_SPECIALS = "([^"]*)"/)?.[1]).toBe(PASSWORD_SPECIALS)
  expect(source).toContain('USERNAME_PATTERN = r"^[A-Za-z][A-Za-z0-9_.-]*[A-Za-z0-9]$"')
  expect(source).toContain(`PASSWORD_RULE`)
})

// 使用者名稱／Email 被占用時，錯誤放在該欄位；等待驗證中的帳號在表單說明何時釋出、如何重寄
test('register conflicts land under the taken field or explain the pending verification', async () => {
  const f = await openRegister()
  let reply = 'USERNAME_TAKEN'
  jest.mocked(api).mockImplementation(async (url: string) => {
    if (url === '/auth/register') throw new ApiError(409, reply)
    return []
  })
  fireEvent.change(f.username, { target: { value: 'goose' } })
  fireEvent.change(f.email, { target: { value: 'a@b.co' } })
  fireEvent.change(f.password, { target: { value: 'Socratic-123456' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '繼續' }))
  })
  expect(screen.getByText('這個使用者名稱已經有人使用，請換一個。')).toHaveAttribute('id', 'register-username-error')
  expect(f.username).toHaveFocus()

  reply = 'EMAIL_TAKEN'
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '繼續' }))
  })
  expect(screen.getByText(/這個 Email 已經註冊過了/)).toHaveAttribute('id', 'register-email-error')
  expect(f.email).toHaveFocus()

  reply = 'ACCOUNT_PENDING_VERIFICATION'
  fireEvent.change(f.email, { target: { value: 'c@d.co' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '繼續' }))
  })
  expect(screen.getByRole('status')).toHaveTextContent('等驗證連結過期')
  expect(screen.getByRole('status')).toHaveTextContent('重新寄送驗證信')
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

test('login keeps whatever the user types (old passwords)', async () => {
  window.history.replaceState({}, '', '/student')
  jest.mocked(api).mockImplementation(async (url: string) => {
    if (url === '/auth/me') throw new ApiError(401, 'LOGIN_REQUIRED')
    return []
  })
  render(<ClassroomApp />)
  const password = await screen.findByLabelText('密碼')
  fireEvent.change(password, { target: { value: 'old pass <with> quotes"' } })
  expect(password).toHaveValue('old pass <with> quotes"')
  expect(screen.queryByText(/已擋下/)).toBeNull()
})

test('question-bank demo stays behind the classroom login boundary', async () => {
  window.history.replaceState({}, '', '/question-bank')
  jest.mocked(api).mockImplementation(async (url: string) => {
    if (url === '/auth/me') throw new ApiError(401, 'LOGIN_REQUIRED')
    return []
  })
  render(<ClassroomApp />)
  expect(await screen.findByLabelText('使用者名稱或 Email')).toBeInTheDocument()
  expect(screen.queryByText('科技系統與社會發展 A')).toBeNull()
})

test.each([
  ['/question-bank', '教師題庫畫面', '科技系統與社會發展 A'],
  ['/danmaku', '學生彈幕畫面', '如果說謊能讓一個人免於痛苦，說謊是對的嗎？'],
  ['/waiting-room', '上課前等待室', '[教室編號]'],
  ['/group-result', '分組結果', '分組完成'],
  ['/poll-result', '選項占比', '說謊能讓人免於痛苦，是對的嗎？'],
  ['/activity-form', '教師出題表單', '新增活動'],
])('authenticated demo route %s shows a visible demo-data boundary', async (pathname, title, content) => {
  window.history.replaceState({}, '', pathname)
  jest.mocked(api).mockImplementation(async (url: string) => {
    if (url === '/auth/me') return account
    return []
  })
  render(<ClassroomApp />)
  expect(await screen.findByText('示範資料')).toBeInTheDocument()
  expect(screen.getByText(title)).toBeInTheDocument()
  expect(screen.getByText(content)).toBeInTheDocument()
})
