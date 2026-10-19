import { act, fireEvent, screen, within } from '@testing-library/react'
import { ApiError } from '../../api/classroomClient'
import { applyLocale } from '../../i18n'
import { readableText } from '../auth/testText'
import { mockApi, renderAt, signedIn } from '../../testing/pageHarness'
import { TeacherCoursePage } from './TeacherCoursePage'

jest.mock('../../api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../api/classroomClient')>('../../api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})
jest.mock('qrcode', () => ({ toDataURL: jest.fn(async (value: string) => 'data:' + value) }))

const course = {
  role: 'teacher', id: 'c-1', name: '科技倫理', teacher_name: 'Fizzy', intro: '', goals: '',
  code: '3CKTGE7Q', code_enabled: true, student_count: 35, activity_count: 0,
  available_actions: ['update', 'rotate_code', 'disable_code', 'create_activity'],
}
const empty = { role: 'teacher', items: [] }

function open(url = '/teach/courses/c-1', overrides: Record<string, unknown> = {}, locale = 'zh-Hant') {
  mockApi({
    'GET /auth/me': { ...signedIn, locale },
    'GET /courses/c-1?role=teacher': { ...course, ...overrides },
    'GET /courses/c-1/activities?role=teacher': empty,
  })
  renderAt(url, '/teach/courses/:courseId/*', <TeacherCoursePage />)
}

test('empty course shows T2 and new-activity link', async () => {
  open()
  expect(await screen.findByRole('heading', { name: '這門課還沒有活動' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '新增活動' })).toHaveAttribute('href', '/teach/courses/c-1/activities/new')
})

test('header shows teacher name and student count', async () => {
  open()
  expect(await screen.findByRole('heading', { level: 1, name: '科技倫理' })).toBeInTheDocument()
  expect(screen.getByText('Fizzy ・ 35 位學生')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '我教的課' })).toHaveAttribute('href', '/?tab=teach')
  const tabs = screen.getByRole('navigation', { name: '課程內容' })
  expect(within(tabs).getByRole('link', { name: '活動' })).toHaveAttribute('aria-current', 'page')
  expect(within(tabs).getByRole('link', { name: '學生 35' })).toHaveAttribute('href', '/teach/courses/c-1/students')
})

test('students and settings tabs show coming soon inside the page', async () => {
  open('/teach/courses/c-1/students')
  expect(await screen.findByRole('heading', { name: '功能開發中' })).toBeInTheDocument()
  expect(screen.getByText('學生名單和每個人的完成進度之後會放在這裡。現在可以先回到活動清單。')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '回到活動' })).toHaveAttribute('href', '/teach/courses/c-1')
  expect(screen.getAllByRole('main')).toHaveLength(1)
})

test('settings tab has its own coming soon text', async () => {
  open('/teach/courses/c-1/settings')
  expect(await screen.findByText('課程設定之後會放在這裡。現在可以先回到活動清單。')).toBeInTheDocument()
})

test('invite opens the course QR dialog', async () => {
  open()
  const invite = await screen.findByRole('button', { name: '邀請學生' })
  await act(async () => { fireEvent.click(invite) })
  expect(await screen.findByRole('img', { name: /QR code/ })).toHaveAttribute('src', 'data:http://localhost/join?code=3CKTGE7Q')
})

test('disabled code shows notice instead of QR', async () => {
  open('/teach/courses/c-1', { code_enabled: false })
  const invite = await screen.findByRole('button', { name: '邀請學生' })
  await act(async () => { fireEvent.click(invite) })
  expect(screen.getByText('課程代碼已停用，學生暫時無法用代碼或 QR code 加入。')).toBeInTheDocument()
  expect(screen.queryByRole('img', { name: /QR code/ })).toBeNull()
  expect(screen.queryByText(/學生用手機掃 QR/)).toBeNull()
})

test('unknown course shows not found', async () => {
  mockApi({
    'GET /courses/c-1?role=teacher': () => { throw new ApiError(404, 'COURSE_NOT_FOUND') },
    'GET /courses/c-1/activities?role=teacher': () => { throw new ApiError(404, 'COURSE_NOT_FOUND') },
  })
  renderAt('/teach/courses/c-1', '/teach/courses/:courseId/*', <TeacherCoursePage />)
  expect(await screen.findByRole('heading', { name: '找不到這門課' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '回到首頁' })).toHaveAttribute('href', '/')
})

test('es locale renders without Chinese', async () => {
  await applyLocale('es')
  open('/teach/courses/c-1', { name: 'Ethics', teacher_name: 'Ana' }, 'es')
  expect(await screen.findByRole('heading', { level: 1, name: 'Ethics' })).toBeInTheDocument()
  expect(readableText(document.body)).not.toMatch(/[㐀-鿿]/)
})

// ---- Review 修正 Task 14 ----

test('new activity link follows create_activity', async () => {
  open('/teach/courses/c-1', { available_actions: ['update', 'rotate_code', 'disable_code'] })
  expect(await screen.findByRole('heading', { name: '這門課還沒有活動' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '新增活動' })).toBeNull()
})

test('new activity link also follows create_activity when there are activities', async () => {
  mockApi({
    'GET /courses/c-1?role=teacher': { ...course, available_actions: ['update'] },
    'GET /courses/c-1/activities?role=teacher': { role: 'teacher', items: [{ id: 'a1', title: '活動一', status: 'draft', locked: false, has_unpublished_changes: false, question_count: 1, starts_at: null, ends_at: 2_000_000_000, available_actions: ['update', 'publish', 'copy', 'delete'] }] },
  })
  renderAt('/teach/courses/c-1', '/teach/courses/:courseId/*', <TeacherCoursePage />)
  expect(await screen.findByText('活動一')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '新增活動' })).toBeNull()
})
