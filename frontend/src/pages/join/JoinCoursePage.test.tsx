import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { ApiError } from '../../api/classroomClient'
import { mockApi, renderAt } from '../../testing/pageHarness'
import { JoinCoursePage } from './JoinCoursePage'

jest.mock('../../api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../api/classroomClient')>('../../api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})

const preview = {
  course_id: 'c-1', name: '哲學導論', teacher_name: '王思齊', already_enrolled: false,
  default_display_name: 'Fizzy', open_activity_title: null,
}
const where = () => screen.getByTestId('where').textContent

function open(url: string, routes: Record<string, unknown>) {
  const calls = mockApi(routes)
  renderAt(url, '/join', <JoinCoursePage />)
  return calls
}

test('confirm join posts display name and opens course', async () => {
  const calls = open('/join?code=3CKTGE7Q', {
    'GET /course-join/preview?code=3CKTGE7Q': preview,
    'POST /courses/join': { role: 'student', id: 'c-1' },
  })
  expect(await screen.findByRole('heading', { name: '哲學導論' })).toBeInTheDocument()
  expect(screen.getByText('王思齊 老師')).toBeInTheDocument()
  expect(screen.getByText('3CKTGE7Q')).toBeInTheDocument()
  const name = screen.getByLabelText('你的名字')
  expect(name).toHaveValue('Fizzy')
  fireEvent.change(name, { target: { value: '小美' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '推門進入' })) })
  expect(calls.find(call => call.key === 'POST /courses/join')?.body).toEqual({ code: '3CKTGE7Q', display_name: '小美' })
  await waitFor(() => expect(where()).toBe('/learn/courses/c-1'))
})

test('blank display name is not sent', async () => {
  const calls = open('/join?code=3CKTGE7Q', { 'GET /course-join/preview?code=3CKTGE7Q': preview })
  fireEvent.change(await screen.findByLabelText('你的名字'), { target: { value: '   ' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '推門進入' })) })
  expect(screen.getByLabelText('你的名字')).toHaveAttribute('aria-invalid', 'true')
  expect(calls.some(call => call.key === 'POST /courses/join')).toBe(false)
})

test('already enrolled skips confirm', async () => {
  open('/join?code=3CKTGE7Q', { 'GET /course-join/preview?code=3CKTGE7Q': { ...preview, already_enrolled: true } })
  await waitFor(() => expect(where()).toBe('/learn/courses/c-1'))
})

test('open activity bar shown when preview has an open activity', async () => {
  open('/join?code=3CKTGE7Q', { 'GET /course-join/preview?code=3CKTGE7Q': { ...preview, open_activity_title: '第三週倫理討論' } })
  expect(await screen.findByText('上課中 · 第三週倫理討論')).toBeInTheDocument()
})

test('wrong code shows error card', async () => {
  open('/join?code=ZZZZZZZZ', { 'GET /course-join/preview?code=ZZZZZZZZ': () => { throw new ApiError(404, 'ENROLL_CODE_NOT_FOUND') } })
  expect(await screen.findByRole('heading', { name: '找不到這個課程代碼' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '回到首頁' })).toHaveAttribute('href', '/')
  expect(screen.queryByLabelText('你的名字')).toBeNull()
})

test('missing code goes home', async () => {
  open('/join', {})
  await waitFor(() => expect(where()).toBe('/'))
})

// ---- Review 修正 Task 14 ----

const desktopMatchMedia = window.matchMedia
afterEach(() => { Object.defineProperty(window, 'matchMedia', { configurable: true, value: desktopMatchMedia }) })
function phone() {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: (query: string) => ({
    matches: query.includes('max-width: 767px'), media: query, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true },
  }) })
}

test('desktop uses the J1 desktop card', async () => {
  open('/join?code=3CKTGE7Q', { 'GET /course-join/preview?code=3CKTGE7Q': { ...preview, open_activity_title: '第三週倫理討論' } })
  expect(await screen.findByRole('heading', { level: 1, name: '哲學導論' })).toBeInTheDocument()
  expect(screen.getByText('主持')).toBeInTheDocument()
  expect(screen.getByText('蘇格拉底')).toBeInTheDocument()
  expect(screen.getByText('王思齊 老師')).toBeInTheDocument()
  expect(screen.getByLabelText('你的名字')).toBeInTheDocument()
  expect(screen.getByText('預設是帳號名稱，可以改成本名或常用的稱呼。')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '推門進入' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '不是這門課？回到首頁' })).toHaveAttribute('href', '/')
  expect(screen.getByText(/上課中 · 第三週倫理討論/)).toBeInTheDocument()
})

test('phone keeps J1m wording', async () => {
  phone()
  open('/join?code=3CKTGE7Q', { 'GET /course-join/preview?code=3CKTGE7Q': preview })
  expect(await screen.findByRole('heading', { level: 1, name: '要加入這門課嗎？' })).toBeInTheDocument()
  expect(screen.getByLabelText('在這門課，大家怎麼稱呼你？')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '加入課程' })).toBeInTheDocument()
})

test('uses preview from the code form without refetching', async () => {
  const calls = mockApi({})
  renderAt({ pathname: '/join', search: '?code=3CKTGE7Q', state: { preview: { ...preview, code: '3CKTGE7Q' } } }, '/join', <JoinCoursePage />)
  expect(await screen.findByRole('heading', { name: '哲學導論' })).toBeInTheDocument()
  expect(calls.some(call => call.key.startsWith('GET /course-join/preview'))).toBe(false)
})

test('a preview for another code is ignored', async () => {
  const calls = mockApi({ 'GET /course-join/preview?code=3CKTGE7Q': preview })
  renderAt({ pathname: '/join', search: '?code=3CKTGE7Q', state: { preview: { ...preview, name: '別門課', code: 'ZZZZZZZZ' } } }, '/join', <JoinCoursePage />)
  expect(await screen.findByRole('heading', { name: '哲學導論' })).toBeInTheDocument()
  expect(calls.some(call => call.key === 'GET /course-join/preview?code=3CKTGE7Q')).toBe(true)
})
