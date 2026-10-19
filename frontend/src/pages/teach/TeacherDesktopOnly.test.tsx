import { screen, waitFor } from '@testing-library/react'
import { Route } from 'react-router-dom'
import { mockApi, renderAt } from '../../testing/pageHarness'
import { TeacherCoursePage } from './TeacherCoursePage'
import { TeacherDesktopOnly } from './TeacherDesktopOnly'

jest.mock('../../api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../api/classroomClient')>('../../api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})

const desktopMatchMedia = window.matchMedia
afterEach(() => { Object.defineProperty(window, 'matchMedia', { configurable: true, value: desktopMatchMedia }) })

function phone() {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: (query: string) => ({
    matches: query.includes('max-width: 767px'), media: query, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true },
  }) })
}

const course = {
  role: 'teacher', id: 'c-1', name: '科技倫理', teacher_name: 'Fizzy', intro: '', goals: '',
  code: '3CKTGE7Q', code_enabled: true, student_count: 0, activity_count: 0, available_actions: [],
}

function open() {
  const calls = mockApi({
    'GET /courses/c-1?role=teacher': course,
    'GET /courses/c-1/activities?role=teacher': { role: 'teacher', items: [] },
  })
  renderAt('/teach/courses/c-1', '/', null, <Route element={<TeacherDesktopOnly />}>
    <Route path="/teach/courses/:courseId" element={<TeacherCoursePage />} />
  </Route>)
  return calls
}

test('phone width shows S4m instead of the teacher course page', async () => {
  phone()
  const calls = open()
  expect(await screen.findByRole('heading', { name: '暫時不支援手機操作' })).toBeInTheDocument()
  expect(screen.getByText('老師的課程頁、出題和看學生的想法，目前只能在電腦上使用。請用電腦登入同一個帳號開啟。')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '回到我教的課' })).toHaveAttribute('href', '/?tab=teach')
  expect(calls.some(call => call.key.startsWith('GET /courses/c-1'))).toBe(false)
})

test('desktop width renders the page', async () => {
  const calls = open()
  expect(await screen.findByRole('heading', { level: 1, name: '科技倫理' })).toBeInTheDocument()
  expect(screen.queryByText('暫時不支援手機操作')).toBeNull()
  await waitFor(() => expect(calls.some(call => call.key === 'GET /courses/c-1?role=teacher')).toBe(true))
})
