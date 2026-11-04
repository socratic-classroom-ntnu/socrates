import fs from 'node:fs'
import path from 'node:path'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Home } from './StudentHome'
import { JOIN_ALIAS_MAX_LENGTH } from '../../contract/limits'
import { ApiError, api } from '../../contract/classroomClient'

jest.mock('../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../contract/classroomClient')>('../../contract/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})
jest.mock('../ai-settings/ProviderSettings', () => ({ ProviderSettings: () => null }))

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

const classroomContracts = path.resolve(__dirname, '../../../../backend/app/modules/classroom_core/contracts.py')
const withBackend = fs.existsSync(classroomContracts) ? test : test.skip

withBackend('the alias limit matches JoinRoom.alias in the backend contract', () => {
  const source = fs.readFileSync(classroomContracts, 'utf8')
  const joinRoom = source.match(/class JoinRoom\(Strict\):([\s\S]*?)\n\n/)
  expect(joinRoom).not.toBeNull()
  const limit = joinRoom?.[1].match(/alias: str = Field\([^)]*max_length=(\d+)/)
  expect(Number(limit?.[1])).toBe(JOIN_ALIAS_MAX_LENGTH)
})

// 錯的教室代碼要說「找不到」，而且錯誤只留在加入卡片：改代碼或切換分頁就消失
test('a wrong classroom code says not found and the error stays scoped to the join card', async () => {
  jest.mocked(api).mockImplementation(async (url: string) => {
    if (url === '/classrooms/join') throw new ApiError(404, 'COURSE_CODE_NOT_FOUND')
    return []
  })
  render(<Home user={account} />)
  const code = screen.getByLabelText('教室代碼')
  fireEvent.change(code, { target: { value: 'ZZZZ9999' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '加入課堂 →' }))
  })
  const form = screen.getByRole('form', { name: '加入課堂' })
  expect(await screen.findByRole('alert')).toHaveTextContent('找不到這個教室代碼，請確認後再輸入。')
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
  expect(screen.queryByText('找不到這個教室代碼，請確認後再輸入。')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '加入與近期課堂' }))
  expect(screen.queryByRole('alert')).toBeNull()
})

test('an empty classroom code is blocked before any request', async () => {
  jest.mocked(api).mockResolvedValue([])
  render(<Home user={account} />)
  await waitFor(() => expect(api).toHaveBeenCalledWith('/classrooms'))
  expect(screen.getByRole('button', { name: '加入課堂 →' })).toBeDisabled()
  await act(async () => {
    fireEvent.submit(screen.getByRole('form', { name: '加入課堂' }))
  })
  expect(screen.getByRole('alert')).toHaveTextContent('請輸入教室代碼。')
  expect(api).not.toHaveBeenCalledWith('/classrooms/join', 'POST', expect.anything())
})
