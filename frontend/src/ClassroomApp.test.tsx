import fs from 'node:fs'
import path from 'node:path'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Home, JOIN_ALIAS_MAX_LENGTH } from './ClassroomApp'
import { InsideAppShell } from './app/shellContext'
import { REGISTER_LIMITS } from './pages/auth/registerChecks'
import { ApiError, api } from './api/classroomClient'

jest.mock('./api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('./api/classroomClient')>('./api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})

// 3D 舞台與團體課堂與這裡的測試無關，jsdom 也載不了它們用到的 ESM（three、.mjs），換成空元件
jest.mock('./features/classroom-stage/Arena', () => ({ Arena: () => null }))
jest.mock('./pages/GroupClassroom', () => ({ GroupClassroomGate: () => null }))
jest.mock('./pages/ProviderSettings', () => ({ ProviderSettings: () => null }))

const account = { id: 'u-1', username: 'Fizzy', verified: true, csrf_token: 'csrf', locale: 'zh-Hant' }


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

const schemas = path.resolve(__dirname, '../../backend/app/modules/classroom_core/api/classroom_schemas.py')
const withBackend = fs.existsSync(schemas) ? test : test.skip

withBackend('the alias limit matches JoinRoom.alias in the backend contract', () => {
  const source = fs.readFileSync(schemas, 'utf8')
  const joinRoom = source.match(/class JoinRoom\(Strict\):([\s\S]*?)\n\n/)
  expect(joinRoom).not.toBeNull()
  const limit = joinRoom?.[1].match(/alias: str = Field\([^)]*max_length=(\d+)/)
  expect(Number(limit?.[1])).toBe(JOIN_ALIAS_MAX_LENGTH)
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

withBackend('register limits match the backend Register contract', () => {
  const source = fs.readFileSync(schemas, 'utf8')
  const register = source.match(/class Register\(Strict\):([\s\S]*?)\n\n/)?.[1] || ''
  for (const field of ['username', 'email', 'password'] as const) {
    const line = register.match(new RegExp(`${field}: str = Field\\(([^)]*)\\)`))?.[1] || ''
    expect([Number(line.match(/min_length=(\d+)/)?.[1]), Number(line.match(/max_length=(\d+)/)?.[1])]).toEqual([...REGISTER_LIMITS[field]])
  }
})

// 新外框已經有使用者名稱、登出與切換到教師端：舊首頁包在外框裡時不要再畫自己的頂端列
test('the student home drops its own top bar inside the app shell', async () => {
  jest.mocked(api).mockResolvedValue([])
  render(<InsideAppShell.Provider value={true}><Home user={account} /></InsideAppShell.Provider>)
  await waitFor(() => expect(api).toHaveBeenCalledWith('/classrooms'))
  expect(screen.queryByRole('button', { name: '登出' })).toBeNull()
  expect(screen.queryByRole('link', { name: '切換到教師端' })).toBeNull()
  expect(screen.getByLabelText('課程代碼')).toBeInTheDocument()
})

test('the student home keeps its top bar outside the app shell', async () => {
  jest.mocked(api).mockResolvedValue([])
  render(<Home user={account} />)
  await waitFor(() => expect(api).toHaveBeenCalledWith('/classrooms'))
  expect(screen.getByRole('button', { name: '登出' })).toBeInTheDocument()
})
