import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { ApiError } from '../../api/classroomClient'
import { formatDateTime } from '../../i18n/format'
import { mockApi, renderAt } from '../../testing/pageHarness'
import { JoinActivityPage } from './JoinActivityPage'

jest.mock('../../api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../api/classroomClient')>('../../api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})

const now = Math.floor(Date.now() / 1000)
const base = {
  activity_id: 'a-1', title: '第三週倫理討論', course_id: 'c-1', course_name: '哲學導論', teacher_name: '王思齊',
  question_count: 2, starts_at: now - 60, ends_at: now + 3600, status: 'open', already_enrolled: false, default_display_name: 'Fizzy',
}
const where = () => screen.getByTestId('where').textContent
const previewKey = 'GET /activities/a-1/join-preview'
const at = (seconds: number, style: Parameters<typeof formatDateTime>[2]) => formatDateTime(seconds, 'zh-Hant', style).replace(/\s+/g, ' ')

function open(preview: unknown, routes: Record<string, unknown> = {}) {
  const calls = mockApi({ [previewKey]: preview, ...routes })
  renderAt('/activities/a-1/join', '/activities/:activityId/join', <JoinActivityPage />)
  return calls
}

test('open activity, not yet a student: join and start', async () => {
  const calls = open(base, { 'POST /activities/a-1/join': { course_id: 'c-1', activity_id: 'a-1', enrolled_now: true } })
  expect(await screen.findByRole('heading', { name: '老師邀請你參加這個活動' })).toBeInTheDocument()
  expect(screen.getByText('第三週倫理討論')).toBeInTheDocument()
  expect(screen.getByText('哲學導論 ・ 王思齊 老師')).toBeInTheDocument()
  expect(screen.getByText('你還不是「哲學導論」的學生，按下開始會同時加入這門課，之後可以從首頁回來。')).toBeInTheDocument()
  expect(document.body.textContent?.replace(/\s+/g, ' ')).toContain(at(base.ends_at, 'weekdayDateTime'))
  fireEvent.change(screen.getByLabelText('在這門課，大家怎麼稱呼你？'), { target: { value: '小美' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '加入並開始對話' })) })
  expect(calls.find(call => call.key === 'POST /activities/a-1/join')?.body).toEqual({ display_name: '小美' })
  await waitFor(() => expect(where()).toBe('/learn/activities/a-1'))
})

test('open activity, already a student: no name field, just start', async () => {
  const calls = open({ ...base, already_enrolled: true }, { 'POST /activities/a-1/join': { course_id: 'c-1', activity_id: 'a-1', enrolled_now: false } })
  const start = await screen.findByRole('button', { name: '開始對話' })
  expect(screen.queryByLabelText('在這門課，大家怎麼稱呼你？')).toBeNull()
  expect(screen.queryByText(/你還不是/)).toBeNull()
  await act(async () => { fireEvent.click(start) })
  expect(calls.find(call => call.key === 'POST /activities/a-1/join')?.body).toEqual({ display_name: 'Fizzy' })
  await waitFor(() => expect(where()).toBe('/learn/activities/a-1'))
})

test('scheduled activity, not yet a student: join the course first', async () => {
  const starts = now + 86400
  const calls = open({ ...base, status: 'scheduled', starts_at: starts, ends_at: starts + 3600 }, {
    'POST /activities/a-1/join': { course_id: 'c-1', activity_id: 'a-1', enrolled_now: true },
  })
  expect(await screen.findByRole('heading', { name: '這個活動還沒開放' })).toBeInTheDocument()
  expect(document.body.textContent?.replace(/\s+/g, ' ')).toContain(`${at(starts, 'weekdayDateTime')} 起`)
  expect(screen.getByLabelText('在這門課，大家怎麼稱呼你？')).toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '先加入課程' })) })
  expect(calls.some(call => call.key === 'POST /activities/a-1/join')).toBe(true)
  await waitFor(() => expect(where()).toBe('/learn/courses/c-1'))
})

test('scheduled activity, already a student: back to the course', async () => {
  const calls = open({ ...base, status: 'scheduled', starts_at: now + 86400, already_enrolled: true })
  expect(await screen.findByRole('heading', { name: '這個活動還沒開放' })).toBeInTheDocument()
  expect(screen.queryByLabelText('在這門課，大家怎麼稱呼你？')).toBeNull()
  expect(screen.getByRole('link', { name: '回到課程頁' })).toHaveAttribute('href', '/learn/courses/c-1')
  expect(calls.some(call => call.key === 'POST /activities/a-1/join')).toBe(false)
})

test('ended activity shows no form', async () => {
  open({ ...base, status: 'ended', ends_at: now - 60 })
  expect(await screen.findByRole('heading', { name: '這個活動已經結束' })).toBeInTheDocument()
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(screen.getByRole('link', { name: '回到首頁' })).toHaveAttribute('href', '/')
})

test('ended activity for a student links back to the course', async () => {
  open({ ...base, status: 'ended', ends_at: now - 60, already_enrolled: true })
  expect(await screen.findByRole('link', { name: '回到課程頁' })).toHaveAttribute('href', '/learn/courses/c-1')
})

test('ended during submit switches to ended state', async () => {
  open(base, { 'POST /activities/a-1/join': () => { throw new ApiError(409, 'ACTIVITY_ENDED') } })
  const join = await screen.findByRole('button', { name: '加入並開始對話' })
  await act(async () => { fireEvent.click(join) })
  expect(await screen.findByRole('heading', { name: '這個活動已經結束' })).toBeInTheDocument()
})

test('deleted activity shows not found', async () => {
  open(() => { throw new ApiError(404, 'ACTIVITY_NOT_FOUND') })
  expect(await screen.findByRole('heading', { name: '找不到這個活動' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '回到首頁' })).toHaveAttribute('href', '/')
})
