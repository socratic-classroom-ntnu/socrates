import fs from 'node:fs'
import path from 'node:path'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ClassroomApp, { Home, JOIN_ALIAS_MAX_LENGTH, REGISTER_LIMITS, registerProblems } from './ClassroomApp'
import { ApiError, api } from './api/classroomClient'

jest.mock('./api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('./api/classroomClient')>('./api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})

// 3D 舞台與團體課堂與這裡的測試無關，jsdom 也載不了它們用到的 ESM（three、.mjs），換成空元件
jest.mock('./features/classroom-stage/Arena', () => ({ Arena: () => null }))
jest.mock('./pages/GroupClassroom', () => ({ GroupClassroomGate: () => null }))
jest.mock('./pages/ProviderSettings', () => ({ ProviderSettings: () => null }))

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

const schemas = path.resolve(__dirname, '../../backend/app/api/classroom_schemas.py')
const withBackend = fs.existsSync(schemas) ? test : test.skip

withBackend('the alias limit matches JoinRoom.alias in the backend contract', () => {
  const source = fs.readFileSync(schemas, 'utf8')
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
  expect(screen.getByText(/使用者名稱只能用文字、數字/)).toBeInTheDocument()
  expect(screen.getByText('密碼至少要 12 個字元，請重新輸入。')).toBeInTheDocument()
  expect(f.username).toHaveFocus()
  expect(registerProblems({ username: '張三', email: 'a@b.co', password: 'x'.repeat(12) })).toEqual([
    { field: 'username', text: '使用者名稱至少要 3 個字元，請重新輸入。' },
  ])
  expect(registerProblems({ username: '張三豐', email: 'a@b.co', password: 'x'.repeat(12) })).toEqual([])
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
  const source = fs.readFileSync(schemas, 'utf8')
  const register = source.match(/class Register\(Strict\):([\s\S]*?)\n\n/)?.[1] || ''
  for (const field of ['username', 'email', 'password'] as const) {
    const line = register.match(new RegExp(`${field}: str = Field\\(([^)]*)\\)`))?.[1] || ''
    expect([Number(line.match(/min_length=(\d+)/)?.[1]), Number(line.match(/max_length=(\d+)/)?.[1])]).toEqual([...REGISTER_LIMITS[field]])
  }
})
