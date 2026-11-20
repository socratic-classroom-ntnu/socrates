import { act, fireEvent, screen } from '@testing-library/react'
import { Route } from 'react-router-dom'
import { ApiError, api } from '../../../contract/classroomClient'
import type { components } from '../../../contract/classroomTypes'
import { applyLocale } from '../../../i18n'
import { mockApi, renderAt, signedIn } from '../../../testing/pageHarness'
import { ActivityProjectorPage, CourseProjectorPage } from './ProjectorPages'

jest.mock('../../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../../contract/classroomClient')>('../../../contract/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})

type Course = components['schemas']['CourseTeacherView']
type Activity = components['schemas']['ActivityTeacherView']

const course: Course = {
  id: 'c-1', role: 'teacher', name: '科技倫理', teacher_name: '王老師', intro: '', goals: '',
  code: '3CKTGE7Q', code_enabled: true, allow_guest: false, student_count: 0, activity_count: 0,
  available_actions: ['disable_code'],
}

function activity(status: Activity['status'] = 'open'): Activity {
  return {
    id: 'a-1', course_id: 'c-1', status, locked: true, has_unpublished_changes: false, revision: 1,
    draft: { title: '第三週倫理討論', scenario: '一輛失控的電車正駛向五名工人。', ends_at: 1_800_000_000 },
    starts_at: null, ends_at: 1_800_000_000, available_actions: [],
  }
}

function openCourse(response: unknown = course, locale: 'zh-Hant' | 'en' | 'es' = 'zh-Hant') {
  mockApi({
    'GET /auth/me': { ...signedIn, locale },
    'GET /courses/c-1?role=teacher': response,
  })
  renderAt('/teach/courses/c-1/projector', '/teach/courses/:courseId/projector', <CourseProjectorPage />,
    <Route path="/teach/courses/c-1" element={<p>course-page</p>} />)
}

function openActivity(activityResponse: unknown = activity(), courseResponse: unknown = course) {
  mockApi({
    'GET /auth/me': signedIn,
    'GET /activities/a-1': activityResponse,
    'GET /courses/c-1?role=teacher': courseResponse,
  })
  renderAt('/teach/activities/a-1/projector', '/teach/activities/:activityId/projector', <ActivityProjectorPage />,
    <Route path="/teach/courses/c-1" element={<p>course-page</p>} />)
}

beforeEach(() => jest.mocked(api).mockReset())
afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
  void applyLocale('zh-Hant')
})

test('course page displays its QR, name and code', async () => {
  openCourse()
  expect(await screen.findByRole('heading', { name: '科技倫理' })).toBeInTheDocument()
  expect(screen.getByText('3CKTGE7Q')).toBeInTheDocument()
  expect(screen.getByText('使用手機掃描 QR Code，或輸入課程代碼加入。')).toBeInTheDocument()
})

test('disabled course code shows status and no QR or code', async () => {
  openCourse({ ...course, code_enabled: false })
  expect(await screen.findByRole('heading', { name: '此課程代碼已停用' })).toBeInTheDocument()
  expect(screen.queryByText('3CKTGE7Q')).toBeNull()
  expect(screen.queryByRole('img')).toBeNull()
})

test.each([
  ['open', '使用手機掃描 QR Code，加入這個課堂活動。'],
  ['scheduled', '活動即將開始，你可以先掃描 QR Code，準備加入。'],
] as const)('activity in %s state displays a join QR', async (status, description) => {
  openActivity(activity(status))
  expect(await screen.findByRole('heading', { name: '第三週倫理討論' })).toBeInTheDocument()
  expect(screen.getByText('科技倫理')).toBeInTheDocument()
  expect(screen.getByText(description)).toBeInTheDocument()
})

test.each([
  ['draft', '活動尚未開放'],
  ['ended', '活動已結束'],
] as const)('activity in %s state shows its status', async (status, title) => {
  openActivity(activity(status))
  expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
})

test('activity not found shows a translated not found state', async () => {
  openActivity(() => { throw new ApiError(404, 'not found') })
  expect(await screen.findByRole('heading', { name: '找不到活動' })).toBeInTheDocument()
})

test('generic load failure can be retried', async () => {
  let attempts = 0
  mockApi({
    'GET /auth/me': signedIn,
    'GET /courses/c-1?role=teacher': () => {
      attempts += 1
      if (attempts === 1) throw new Error('offline')
      return course
    },
  })
  renderAt('/teach/courses/c-1/projector', '/teach/courses/:courseId/projector', <CourseProjectorPage />)
  fireEvent.click(await screen.findByRole('button', { name: '重新載入' }))
  expect(await screen.findByRole('heading', { name: '科技倫理' })).toBeInTheDocument()
  expect(attempts).toBe(2)
})

test('activity remains in loading state while its parent course is loading', async () => {
  let resolveCourse!: (value: Course) => void
  mockApi({
    'GET /auth/me': signedIn,
    'GET /activities/a-1': activity(),
    'GET /courses/c-1?role=teacher': () => new Promise<Course>(resolve => { resolveCourse = resolve }),
  })
  renderAt('/teach/activities/a-1/projector', '/teach/activities/:activityId/projector', <ActivityProjectorPage />)
  expect(await screen.findByLabelText('載入投影畫面')).toHaveAttribute('aria-busy', 'true')
  await act(async () => resolveCourse(course))
  expect(await screen.findByRole('heading', { name: '第三週倫理討論' })).toBeInTheDocument()
})

test('activity is shown with a parent course load error', async () => {
  openActivity(activity(), () => { throw new Error('offline') })
  expect(await screen.findByRole('heading', { name: '無法顯示加入資訊' })).toBeInTheDocument()
  expect(screen.getByText('請確認網路連線，或重新載入投影畫面。')).toBeInTheDocument()
})

test('Escape closes the projector first and replaces history with the owner course after the fallback delay', async () => {
  jest.useFakeTimers()
  const close = jest.spyOn(window, 'close').mockImplementation(() => {})
  openCourse()
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(close).toHaveBeenCalledTimes(1)
  expect(screen.queryByText('course-page')).toBeNull()
  await act(async () => { jest.advanceTimersByTime(500) })
  expect(screen.getByText('course-page')).toBeInTheDocument()
})
