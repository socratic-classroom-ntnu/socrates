import { act, fireEvent, screen, within } from '@testing-library/react'
import { ApiError } from '../../../contract/classroomClient'
import { applyLocale } from '../../../i18n'
import { readableText } from '../../auth/testText'
import { mockApi, renderAt, signedIn, type ApiRoutes } from '../../../testing/pageHarness'
import { TeacherCoursePage } from './TeacherCoursePage'

jest.mock('../../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../../contract/classroomClient')>('../../../contract/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})
jest.mock('qrcode', () => ({ toDataURL: jest.fn(async (value: string) => 'data:' + value) }))

const course = {
  role: 'teacher', id: 'c-1', name: '科技倫理', teacher_name: 'Fizzy', intro: '', goals: '',
  code: '3CKTGE7Q', code_enabled: true, allow_guest: false, student_count: 35, activity_count: 0,
  available_actions: ['update', 'rotate_code', 'disable_code', 'create_activity'],
}
const empty = { role: 'teacher', items: [] }

function open(url = '/teach/courses/c-1', overrides: Record<string, unknown> = {}, locale = 'zh-Hant', extra: ApiRoutes = {}) {
  const calls = mockApi({
    'GET /auth/me': { ...signedIn, locale },
    'GET /courses/c-1?role=teacher': { ...course, ...overrides },
    'GET /courses/c-1/activities?role=teacher': empty,
    ...extra,
  })
  renderAt(url, '/teach/courses/:courseId/*', <TeacherCoursePage />)
  return calls
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
  expect(screen.getByRole('link', { name: '課程' })).toHaveAttribute('href', '/?tab=teach')
  const tabs = screen.getByRole('navigation', { name: '課程內容' })
  expect(within(tabs).getByRole('link', { name: '活動' })).toHaveAttribute('aria-current', 'page')
  expect(within(tabs).getByRole('link', { name: '學生 35' })).toHaveAttribute('href', '/teach/courses/c-1/students')
})

test('header shows the course name under a course breadcrumb', async () => {
  open()

  const path = await screen.findByRole('navigation', { name: '課程路徑' })
  expect(within(path).getByRole('link', { name: '課程' })).toHaveAttribute('href', '/?tab=teach')
  expect(path).toHaveTextContent('課程 /')
  expect(screen.getByRole('heading', { level: 1, name: '科技倫理' })).toBeInTheDocument()
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


test('new activity link follows create_activity', async () => {
  open('/teach/courses/c-1', { available_actions: ['update', 'rotate_code', 'disable_code'] })
  expect(await screen.findByRole('heading', { name: '這門課還沒有活動' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '新增活動' })).toBeNull()
})

test('new activity link also follows create_activity when there are activities', async () => {
  mockApi({
    'GET /courses/c-1?role=teacher': { ...course, available_actions: ['update'] },
    'GET /courses/c-1/activities?role=teacher': { role: 'teacher', items: [{ id: 'a1', title: '活動一', status: 'draft', locked: false, has_unpublished_changes: false, starts_at: null, ends_at: 2_000_000_000, available_actions: ['update', 'publish', 'copy', 'delete'] }] },
  })
  renderAt('/teach/courses/c-1', '/teach/courses/:courseId/*', <TeacherCoursePage />)
  expect(await screen.findByText('活動一')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '新增活動' })).toBeNull()
})

async function openInvite(overrides: Record<string, unknown>, patch: ApiRoutes[string]) {
  const calls = open('/teach/courses/c-1', overrides, 'zh-Hant', { 'PATCH /courses/c-1': patch })
  const invite = await screen.findByRole('button', { name: '邀請學生' })
  await act(async () => { fireEvent.click(invite) })
  return calls
}

test('guest switch turns guest join on with PATCH and disables while saving', async () => {
  let finish: (value: unknown) => void = () => {}
  const calls = await openInvite({ allow_guest: false }, (body: Record<string, unknown>) => new Promise(resolve => { finish = () => resolve({ ...course, allow_guest: body.allow_guest }) }))
  const toggle = screen.getByRole('switch', { name: '允許免註冊加入' })
  expect(toggle).toHaveAttribute('aria-checked', 'false')
  expect(screen.getByText('學生要登入或註冊才能加入；已經加入的訪客不受影響。')).toBeInTheDocument()
  await act(async () => { fireEvent.click(toggle) })
  expect(toggle).toBeDisabled()
  expect(calls.filter(call => call.key === 'PATCH /courses/c-1')).toEqual([{ key: 'PATCH /courses/c-1', body: { allow_guest: true } }])
  await act(async () => { finish(undefined) })
  expect(toggle).toBeEnabled()
  expect(toggle).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByText('學生掃碼後可以取個名字直接加入，紀錄保留 7 天。')).toBeInTheDocument()
})

test('guest switch turns guest join off with PATCH', async () => {
  const calls = await openInvite({ allow_guest: true }, (body: Record<string, unknown>) => ({ ...course, allow_guest: body.allow_guest }))
  const toggle = screen.getByRole('switch', { name: '允許免註冊加入' })
  expect(toggle).toHaveAttribute('aria-checked', 'true')
  await act(async () => { fireEvent.click(toggle) })
  expect(calls.filter(call => call.key === 'PATCH /courses/c-1')).toEqual([{ key: 'PATCH /courses/c-1', body: { allow_guest: false } }])
  expect(toggle).toHaveAttribute('aria-checked', 'false')
  expect(screen.getByText('學生要登入或註冊才能加入；已經加入的訪客不受影響。')).toBeInTheDocument()
})

test('failed guest switch save reverts and shows the error', async () => {
  await openInvite({ allow_guest: false }, () => { throw new ApiError(500, 'BOOM') })
  const toggle = screen.getByRole('switch', { name: '允許免註冊加入' })
  await act(async () => { fireEvent.click(toggle) })
  expect(toggle).toHaveAttribute('aria-checked', 'false')
  expect(toggle).toBeEnabled()
  expect(screen.getByRole('alert')).toHaveTextContent('伺服器暫時無法處理，請稍後再試。')
})

test('guest switch is still shown when the course code is disabled', async () => {
  await openInvite({ code_enabled: false, allow_guest: true }, {})
  expect(screen.queryByRole('img', { name: /QR code/ })).toBeNull()
  expect(screen.getByRole('switch', { name: '允許免註冊加入' })).toHaveAttribute('aria-checked', 'true')
})
