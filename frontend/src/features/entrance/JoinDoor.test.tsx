import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JoinDoor, joinErrorText, recentRoomRole } from './JoinDoor'
import { ApiError, api } from '../../contract/classroomClient'

jest.mock('../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../contract/classroomClient')>('../../contract/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn() }
})

const user = { username: 'siqi', points: 3 } as Parameters<typeof JoinDoor>[0]['user']

beforeEach(() => {
  jest.mocked(api).mockReset()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

const renderDoor = (props = {}) =>
  render(<JoinDoor user={user} rooms={[]} note="" onMode={jest.fn()} {...props} />)

test('joining posts the upper-cased code, the alias and the default avatar', async () => {
  jest.mocked(api).mockResolvedValue({ id: 'room-1' })
  renderDoor()
  fireEvent.change(screen.getByLabelText(/^課程代碼/), { target: { value: 'a1b2c3d4' } })
  fireEvent.change(screen.getByLabelText('本次匿名名稱（選填）'), { target: { value: ' 陳思齊 ' } })
  fireEvent.click(screen.getByRole('button', { name: '加入課堂 →' }))
  await waitFor(() => expect(api).toHaveBeenCalledWith('/classrooms/join', 'POST', {
    code: 'A1B2C3D4', alias: '陳思齊', avatar: 'scholar',
  }))
})

test('a blank name joins with a temporary alias', async () => {
  jest.mocked(api).mockResolvedValue({ id: 'room-1' })
  renderDoor()
  fireEvent.change(screen.getByLabelText(/^課程代碼/), { target: { value: 'A1B2C3D4' } })
  fireEvent.click(screen.getByRole('button', { name: '加入課堂 →' }))
  await waitFor(() => expect(api).toHaveBeenCalledWith('/classrooms/join', 'POST', {
    code: 'A1B2C3D4', alias: expect.stringMatching(/^~pending-[0-9a-f]{8}$/), avatar: 'scholar',
  }))
})

test('an unknown code explains itself and lets the student try again', async () => {
  jest.mocked(api).mockRejectedValue(new ApiError(404, 'COURSE_CODE_REQUIRED'))
  renderDoor()
  fireEvent.change(screen.getByLabelText(/^課程代碼/), { target: { value: 'ZZZZZZZZ' } })
  fireEvent.click(screen.getByRole('button', { name: '加入課堂 →' }))
  expect(await screen.findByText('找不到這個課程代碼，請確認後再輸入。')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '加入課堂 →' })).toBeEnabled()
})

test('the other entrances remain reachable', () => {
  const onMode = jest.fn()
  renderDoor({ onMode, rooms: [{ id: 'r1', title: '正義論', phase: 'lobby', teacher: false }] })
  fireEvent.click(screen.getByRole('button', { name: '教師工作室' }))
  expect(onMode).toHaveBeenCalledWith('teacher')
  fireEvent.click(screen.getByRole('button', { name: 'AI 連線設定' }))
  expect(onMode).toHaveBeenCalledWith('providers')
  expect(screen.getByText('siqi · 3 點')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /正義論/ })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /單人練習/ })).toHaveAttribute('href', '/round1')
})

test('logout calls the API', async () => {
  jest.mocked(api).mockResolvedValue({})
  renderDoor()
  fireEvent.click(screen.getByRole('button', { name: '登出' }))
  await waitFor(() => expect(api).toHaveBeenCalledWith('/auth/logout', 'POST'))
})

test('join errors keep server sentences and translate codes', () => {
  expect(joinErrorText(new ApiError(404, 'COURSE_CODE_REQUIRED'))).toMatch('找不到這個課程代碼')
  expect(joinErrorText(new ApiError(409, '下次開課時可加入；既有成員可直接續接。')))
    .toBe('下次開課時可加入；既有成員可直接續接。')
})

test('recent classroom entries preserve the teacher or student mode', () => {
  expect(recentRoomRole({ teacher: true })).toBe('teacher')
  expect(recentRoomRole({ teacher: false })).toBe('student')
})
