import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { ApiError } from '../../../contract/classroomClient'
import type { components } from '../../../contract/classroomTypes'
import { mockApi, renderAt, signedIn, type ApiRoutes } from '../../../testing/pageHarness'
import { TeacherCoursePage } from './TeacherCoursePage'

jest.mock('../../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../../contract/classroomClient')>('../../../contract/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})
jest.mock('qrcode', () => ({ toDataURL: jest.fn(async (value: string) => 'data:' + value) }))

type Roster = components['schemas']['SoloCourseRosterView']
type Student = Roster['students'][number]

// 名單的「現在」是後端產生名單的時間：2026/11/16 14:00（瀏覽器時區）
const generatedAt = new Date(2026, 10, 16, 14, 0).getTime() / 1000
const at = (month: number, day: number, hour = 9, minute = 0) => new Date(2026, month - 1, day, hour, minute).getTime() / 1000

const course = {
  role: 'teacher', id: 'c-1', name: '科技倫理', teacher_name: 'Fizzy', intro: '', goals: '',
  code: '3CKTGE7Q', code_enabled: true, allow_guest: true, student_count: 35, activity_count: 2,
  available_actions: ['update', 'rotate_code', 'disable_code', 'create_activity'],
}

function student(overrides: Partial<Student> & Pick<Student, 'enrollment_id' | 'display_name'>): Student {
  return {
    kind: 'registered', guest_number: null, email: `${overrides.enrollment_id}@example.edu`,
    joined_at: at(9, 15), last_activity_at: null, completed_activities: 0, ...overrides,
  }
}

const first: Student[] = [
  student({ enrollment_id: 'e-mei', display_name: '小美', email: 'mei.lin@example.edu', last_activity_at: at(11, 16, 10, 31), completed_activities: 2 }),
  student({ enrollment_id: 'e-owl', display_name: '安靜的貓頭鷹', kind: 'guest', email: null, joined_at: at(11, 12), last_activity_at: at(11, 16, 9, 40), completed_activities: 1 }),
  student({ enrollment_id: 'e-chen', display_name: '陳柏翰', email: 'pohan.chen@example.edu', last_activity_at: at(11, 15, 21, 40), completed_activities: 1 }),
  student({ enrollment_id: 'e-wang', display_name: '王子豪', email: 'zihao.wang@example.edu', last_activity_at: at(11, 13), completed_activities: 0 }),
  student({ enrollment_id: 'e-otter', display_name: '好奇的海獺', kind: 'guest', email: null, joined_at: at(11, 13) }),
  student({ enrollment_id: 'e-anon1', display_name: '', kind: 'expired_guest', guest_number: 1, email: null, joined_at: at(10, 29), last_activity_at: at(11, 2) }),
  student({ enrollment_id: 'e-anon2', display_name: '', kind: 'expired_guest', guest_number: 2, email: null, joined_at: at(10, 30), last_activity_at: at(10, 31) }),
]
const rest: Student[] = Array.from({ length: 28 }, (_, i) => student({ enrollment_id: `e-${i}`, display_name: `學生${i + 1}` }))

function roster(students: Student[] = [...first, ...rest], counted = 2): Roster {
  const count = (kind: Student['kind']) => students.filter(s => s.kind === kind).length
  return {
    course_id: 'c-1', course_name: '科技倫理', generated_at: generatedAt, counted_activities: counted,
    summary: { total: students.length, registered: count('registered'), guests: count('guest'), expired_guests: count('expired_guest'), deleted: count('deleted') },
    students,
  }
}

function open(routes: ApiRoutes = {}) {
  const calls = mockApi({
    'GET /auth/me': signedIn,
    'GET /courses/c-1?role=teacher': course,
    'GET /solo/courses/c-1/students': roster(),
    ...routes,
  })
  renderAt('/teach/courses/c-1/students', '/teach/courses/:courseId/*', <TeacherCoursePage />)
  return calls
}

const table = async () => screen.findByRole('table', { name: '學生名單' })
const rowOf = (name: string) => screen.getByRole('row', { name: new RegExp(name) })
const footer = () => screen.getByTestId('roster-footer')

test('lists students in the order the server gives, with guest tags and dashes (P1)', async () => {
  open()
  const rows = within(await table()).getAllByRole('row').slice(1)
  expect(rows).toHaveLength(8)
  expect(rows.map(row => within(row).getAllByRole('cell')[0].textContent)).toEqual([
    '小小美', '訪安靜的貓頭鷹訪客', '陳陳柏翰', '王王子豪', '訪好奇的海獺訪客', '訪過期訪客 1訪客', '訪過期訪客 2訪客', '學學生1',
  ])
  expect(within(rowOf('安靜的貓頭鷹')).getAllByRole('cell')[1]).toHaveTextContent('—')
  expect(within(rowOf('小美')).getAllByRole('cell')[1]).toHaveTextContent('mei.lin@example.edu')
  for (const header of ['名稱', '電子郵件', '加入日期', '最近活動', '活動進度']) {
    expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument()
  }
})

test('shows joined date, last activity and progress with a progress bar (P4, P10, P13)', async () => {
  open({ 'GET /solo/courses/c-1/students': roster(undefined, 4) })
  await table()
  const cells = within(rowOf('小美')).getAllByRole('cell')
  expect(cells[2]).toHaveTextContent('9/15')
  expect(cells[3]).toHaveTextContent('今天 10:31')
  expect(cells[4]).toHaveTextContent('完成 2／4')
  const bar = within(cells[4]).getByRole('progressbar')
  expect(bar).toHaveAttribute('aria-valuenow', '2')
  expect(bar).toHaveAttribute('aria-valuemax', '4')
  expect(within(rowOf('陳柏翰')).getAllByRole('cell')[3]).toHaveTextContent('昨天 21:40')
  expect(within(rowOf('王子豪')).getAllByRole('cell')[3]).toHaveTextContent('3 天前')
  expect(within(rowOf('過期訪客 1')).getAllByRole('cell')[3]).toHaveTextContent('11/2')
})

test('no activity yet and no counted activity both read as a dash (P7, P10)', async () => {
  open({ 'GET /solo/courses/c-1/students': roster(undefined, 0) })
  await table()
  const cells = within(rowOf('好奇的海獺')).getAllByRole('cell')
  expect(cells[3]).toHaveTextContent('—')
  expect(cells[4]).toHaveTextContent('—')
  expect(within(cells[4]).queryByRole('progressbar')).toBeNull()
})

test('the footer counts every kind and pages eight at a time (P5)', async () => {
  open()
  await table()
  expect(footer()).toHaveTextContent('共 35 位學生（正式學生 31 位、訪客 2 位、過期訪客 2 位）・顯示第 1–8 位')
  expect(screen.getByRole('button', { name: '上一頁' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '下一頁' }))
  expect(footer()).toHaveTextContent('顯示第 9–16 位')
  expect(rowOf('學生2')).toBeInTheDocument()
  for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByRole('button', { name: '下一頁' }))
  expect(footer()).toHaveTextContent('顯示第 33–35 位')
  expect(screen.getByRole('button', { name: '下一頁' })).toBeDisabled()
})

test('a student who deleted their account is listed as 已刪除的帳號 and counted on their own', async () => {
  const gone = student({ enrollment_id: 'e-gone', display_name: '', kind: 'deleted', email: null, completed_activities: 1 })
  open({ 'GET /solo/courses/c-1/students': roster([first[0], gone]) })

  const row = await screen.findByRole('row', { name: /已刪除的帳號/ })
  expect(row).not.toHaveTextContent('訪客')
  expect(footer()).toHaveTextContent('共 2 位學生（正式學生 1 位、訪客 0 位、過期訪客 0 位）・已刪除 1 位')
})

test('search filters by the shown name or email and goes back to the first page (P11, P14)', async () => {
  open()
  await table()
  fireEvent.click(screen.getByRole('button', { name: '下一頁' }))
  fireEvent.change(screen.getByRole('searchbox', { name: '搜尋學生' }), { target: { value: 'POHAN' } })
  let rows = within(await table()).getAllByRole('row').slice(1)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toHaveTextContent('陳柏翰')
  expect(footer()).toHaveTextContent('共 35 位學生（正式學生 31 位、訪客 2 位、過期訪客 2 位）・符合 1 位・顯示第 1–1 位')

  fireEvent.change(screen.getByRole('searchbox', { name: '搜尋學生' }), { target: { value: '過期訪客 2' } })
  rows = within(await table()).getAllByRole('row').slice(1)
  expect(rows.map(row => row.textContent)).toEqual([expect.stringContaining('過期訪客 2')])

  fireEvent.change(screen.getByRole('searchbox', { name: '搜尋學生' }), { target: { value: 'nobody@nowhere' } })
  expect(await screen.findByText('沒有符合的學生')).toBeInTheDocument()
  expect(footer()).toHaveTextContent('符合 0 位')
  expect(footer()).not.toHaveTextContent('顯示第')
  expect(screen.getByRole('button', { name: '上一頁' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '下一頁' })).toBeDisabled()
})

test('a course without students says so', async () => {
  open({ 'GET /solo/courses/c-1/students': roster([]) })
  expect(await screen.findByText('還沒有學生加入這門課。')).toBeInTheDocument()
  expect(screen.queryByRole('table')).toBeNull()
})

test('the ⋮ menu has only 移出課程, and cancelling removes nobody (P2, P8)', async () => {
  const calls = open()
  await table()
  fireEvent.click(within(rowOf('安靜的貓頭鷹')).getByRole('button', { name: '安靜的貓頭鷹 的更多操作' }))
  const menu = screen.getByRole('menu')
  expect(within(menu).getAllByRole('menuitem').map(item => item.textContent)).toEqual(['移出課程'])
  fireEvent.click(within(menu).getByRole('menuitem', { name: '移出課程' }))

  const dialog = screen.getByRole('dialog', { name: '移出 安靜的貓頭鷹？' })
  expect(dialog).toHaveTextContent('這門課的作答紀錄會全部刪除，無法復原。')
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(calls.some(call => call.key.startsWith('DELETE'))).toBe(false)
})

test('confirming removes the student and reloads the roster and the course count', async () => {
  let removed = false
  const calls = open({
    'GET /solo/courses/c-1/students': () => roster(removed ? [...first, ...rest].filter(s => s.enrollment_id !== 'e-anon1') : undefined),
    'GET /courses/c-1?role=teacher': () => ({ ...course, student_count: removed ? 34 : 35 }),
    'DELETE /courses/c-1/students/e-anon1': () => { removed = true; return null },
  })
  await table()
  fireEvent.click(within(rowOf('過期訪客 1')).getByRole('button', { name: '過期訪客 1 的更多操作' }))
  fireEvent.click(screen.getByRole('menuitem', { name: '移出課程' }))
  const dialog = screen.getByRole('dialog', { name: '移出 過期訪客 1？' })
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '確定移出' })) })

  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  await waitFor(() => expect(footer()).toHaveTextContent('共 34 位學生'))
  expect(screen.queryByRole('row', { name: /過期訪客 1/ })).toBeNull()
  expect(screen.getByRole('link', { name: '學生 34' })).toBeInTheDocument()
  expect(calls.filter(call => call.key === 'DELETE /courses/c-1/students/e-anon1')).toHaveLength(1)
})

test('a student already removed elsewhere counts as removed', async () => {
  open({ 'DELETE /courses/c-1/students/e-mei': () => { throw new ApiError(404, 'ENROLLMENT_NOT_FOUND') } })
  await table()
  fireEvent.click(within(rowOf('小美')).getByRole('button', { name: '小美 的更多操作' }))
  fireEvent.click(screen.getByRole('menuitem', { name: '移出課程' }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '確定移出' })) })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})

test('any other failure stays in the dialog with a message', async () => {
  open({ 'DELETE /courses/c-1/students/e-mei': () => { throw new ApiError(0, 'NETWORK') } })
  await table()
  fireEvent.click(within(rowOf('小美')).getByRole('button', { name: '小美 的更多操作' }))
  fireEvent.click(screen.getByRole('menuitem', { name: '移出課程' }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '確定移出' })) })
  const dialog = screen.getByRole('dialog', { name: '移出 小美？' })
  expect(within(dialog).getByRole('alert')).toBeInTheDocument()
})

test('removing the only student on the last page moves back a page (P14)', async () => {
  const nine = [...first, ...rest].slice(0, 9)
  let removed = false
  open({
    'GET /solo/courses/c-1/students': () => roster(removed ? nine.slice(0, 8) : nine),
    'DELETE /courses/c-1/students/e-1': () => { removed = true; return null },
  })
  await table()
  fireEvent.click(screen.getByRole('button', { name: '下一頁' }))
  expect(footer()).toHaveTextContent('顯示第 9–9 位')
  fireEvent.click(within(rowOf('學生2')).getByRole('button', { name: '學生2 的更多操作' }))
  fireEvent.click(screen.getByRole('menuitem', { name: '移出課程' }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '確定移出' })) })
  await waitFor(() => expect(footer()).toHaveTextContent('顯示第 1–8 位'))
  expect(within(await table()).getAllByRole('row').slice(1)).toHaveLength(8)
})
