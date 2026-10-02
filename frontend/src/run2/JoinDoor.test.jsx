import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JoinDoor, joinErrorText } from './JoinDoor'
import { ApiError, api } from './client'

jest.mock('./client', () => {
  const actual = jest.requireActual('./client')
  return { ApiError: actual.ApiError, api: jest.fn() }
})

const user = { username: 'siqi', points: 3 }

beforeEach(() => {
  api.mockReset()
  // jsdom 不支援真的換頁；擋下 console.error 的 "Not implemented: navigation"
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

const renderDoor = (props = {}) =>
  render(<JoinDoor user={user} rooms={[]} note="" onMode={jest.fn()} {...props} />)

// 換外觀不能換功能：送出的端點與資料必須和原本的學生入口一致。
test('joining posts the upper-cased code, the alias and the default avatar', async () => {
  api.mockResolvedValue({ id: 'room-1' })
  renderDoor()

  fireEvent.change(screen.getByLabelText(/^課程代碼/), { target: { value: 'a1b2c3d4' } })
  fireEvent.change(screen.getByLabelText(/^你的名字/), { target: { value: ' 陳思齊 ' } })
  fireEvent.click(screen.getByRole('button', { name: '推門進入 →' }))

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('/classrooms/join', 'POST', {
      code: 'A1B2C3D4',
      alias: '陳思齊',
      avatar: 'scholar',
    }),
  )
  expect(screen.getByRole('button', { name: '推門中…' })).toBeDisabled()
})

test('a blank name still joins with a temporary alias, as before', async () => {
  api.mockResolvedValue({ id: 'room-1' })
  renderDoor()

  fireEvent.change(screen.getByLabelText(/^課程代碼/), { target: { value: 'A1B2C3D4' } })
  fireEvent.click(screen.getByRole('button', { name: '推門進入 →' }))

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('/classrooms/join', 'POST', {
      code: 'A1B2C3D4',
      alias: '~pending-00000000',
      avatar: 'scholar',
    }),
  )
})

test('an unknown code explains itself and lets the student try again', async () => {
  api.mockRejectedValue(new ApiError(404, 'COURSE_CODE_REQUIRED'))
  renderDoor()

  fireEvent.change(screen.getByLabelText(/^課程代碼/), { target: { value: 'ZZZZZZZZ' } })
  fireEvent.click(screen.getByRole('button', { name: '推門進入 →' }))

  expect(await screen.findByText('找不到這個課程代碼，請再確認一次。')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '推門進入 →' })).toBeEnabled()
})

test('the other entrances are still reachable from the door', () => {
  const onMode = jest.fn()
  renderDoor({ onMode, rooms: [{ id: 'r1', title: '正義論', phase: 'lobby', teacher: false }] })

  fireEvent.click(screen.getByRole('button', { name: '教師工作室' }))
  expect(onMode).toHaveBeenCalledWith('teacher')
  fireEvent.click(screen.getByRole('button', { name: 'LLM 設定' }))
  expect(onMode).toHaveBeenCalledWith('providers')
  expect(screen.getByText('siqi · 3 點')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /正義論/ })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /單人練習/ })).toHaveAttribute('href', '/round1')
})

test('logout calls the API', async () => {
  api.mockResolvedValue({})
  renderDoor()
  fireEvent.click(screen.getByRole('button', { name: '登出' }))
  await waitFor(() => expect(api).toHaveBeenCalledWith('/auth/logout', 'POST'))
})

test('join errors keep server sentences and translate codes', () => {
  expect(joinErrorText(new ApiError(404, 'COURSE_CODE_REQUIRED'))).toMatch('找不到這個課程代碼')
  expect(joinErrorText(new ApiError(409, '下次開課時可加入；既有成員可直接續接。')))
    .toBe('下次開課時可加入；既有成員可直接續接。')
  expect(joinErrorText(new ApiError(403, 'ORIGIN_BINDING_REQUIRED'))).toMatch('網址')
})
