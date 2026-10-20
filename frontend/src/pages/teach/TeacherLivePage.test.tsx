import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { components } from '../../api/classroomTypes'
import { api } from '../../api/classroomClient'
import { applyLocale } from '../../i18n'
import { mockApi, renderAt, signedIn } from '../../testing/pageHarness'
import { TeacherLivePage } from './TeacherLivePage'

jest.mock('../../api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../api/classroomClient')>('../../api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})

type Progress = components['schemas']['SoloActivityProgressView']
type Activity = components['schemas']['ActivityTeacherView']

const generatedAt = 1_800_000_000
const progress: Progress = {
  activity_id: 'a-1', title: '科技與選擇', course_id: 'c-1', course_name: '科技倫理',
  status: 'open', question_count: 2, ends_at: generatedAt + 3600, generated_at: generatedAt,
  questions: [{ index: 0, title: '電車難題' }, { index: 1, title: '器官移植' }],
  summary: { enrolled: 4, started: 3, done: 1, unconfirmed_by_question: [1, 2], attention: 1 },
  students: [
    { enrollment_id: 'e-1', display_name: '小安', overall: 'in_progress', cells: [{ status: 'confirmed', turns: 4 }, { status: 'in_dialogue', turns: 3 }], review_status: 'not_started', last_activity_at: generatedAt - 120, attention: true },
    { enrollment_id: 'e-2', display_name: '小博', overall: 'done', cells: [{ status: 'confirmed', turns: 3 }, { status: 'confirmed', turns: 5 }], review_status: 'in_progress', last_activity_at: generatedAt - 20, attention: false },
    { enrollment_id: 'e-3', display_name: '小慈', overall: 'not_started', cells: [{ status: 'not_started', turns: null }, { status: 'not_started', turns: null }], review_status: 'not_started', last_activity_at: null, attention: false },
    { enrollment_id: 'e-4', display_name: '小德', overall: 'in_progress', cells: [{ status: 'confirming', turns: 2 }, { status: 'not_started', turns: null }], review_status: 'not_started', last_activity_at: generatedAt - 30, attention: false },
  ],
}

function activity(actions: Activity['available_actions'] = ['end_now']): Activity {
  return {
    id: 'a-1', course_id: 'c-1', status: 'open', locked: true, has_unpublished_changes: false,
    revision: 1, draft: { title: progress.title, topic_direction: '', analysis_focus: '', ends_at: progress.ends_at!, questions: [] },
    starts_at: generatedAt - 3600, ends_at: progress.ends_at, available_actions: actions,
  }
}

function open(options: { actions?: Activity['available_actions']; locale?: 'zh-Hant' | 'en' | 'es'; view?: Progress } = {}) {
  const calls = mockApi({
    'GET /auth/me': { ...signedIn, locale: options.locale ?? 'zh-Hant' },
    'GET /solo/activities/a-1/progress': options.view ?? progress,
    'GET /activities/a-1': activity(options.actions),
    'POST /activities/a-1/end_now': {},
  })
  renderAt('/teach/activities/a-1', '/teach/activities/:activityId', <TeacherLivePage />)
  return calls
}

beforeEach(() => {
  jest.mocked(api).mockReset()
})

afterEach(() => {
  jest.useRealTimers()
  applyLocale('zh-Hant')
})

test('renders the live header, question summaries, progress table, timestamps and privacy footer', async () => {
  open()
  const page = await screen.findByTestId('teacher-live-page')

  expect(within(page).getByRole('link', { name: '課程' })).toHaveAttribute('href', '/teach/courses/c-1')
  expect(within(page).getByText('科技倫理')).toBeInTheDocument()
  expect(within(page).getByRole('heading', { name: '科技與選擇' })).toBeInTheDocument()
  expect(within(page).getByText('進行中', { selector: '.status-pill' })).toBeInTheDocument()
  expect(within(page).getByText(/2 題/)).toBeInTheDocument()
  expect(within(page).getByRole('link', { name: '投影活動 QR' })).toHaveAttribute('href', '/teach/activities/a-1/projector')
  expect(within(page).getByRole('link', { name: '統計分析' })).toHaveAttribute('href', '/teach/activities/a-1/analysis')

  expect(within(page).getAllByText('電車難題')).toHaveLength(2)
  // 「還沒確認」含還沒做到這一題的人，所以分母是整個活動的開始人數，不是這一題的
  expect(within(page).getByText('還沒確認 1 人 · 共 3 人開始')).toBeInTheDocument()
  expect(within(page).getByText('還沒確認 2 人 · 共 3 人開始')).toBeInTheDocument()
  expect(within(page).getByText('需要留意 1 人（超過 5 分鐘沒有動作）')).toBeInTheDocument()

  const table = within(page).getByRole('table')
  for (const heading of ['學生', '電車難題', '器官移植', '回顧與反思', '最後動作']) {
    expect(within(table).getByRole('columnheader', { name: heading })).toBeInTheDocument()
  }
  expect(within(table).getAllByText('已確認').length).toBeGreaterThan(0)
  expect(within(table).getByText('對話中 · 3 輪')).toBeInTheDocument()
  expect(within(table).getByText('確認觀點中')).toBeInTheDocument()
  expect(within(table).getAllByText('未開始').length).toBeGreaterThan(0)
  expect(within(table).getAllByText('剛剛')).toHaveLength(2)
  expect(within(table).getByText('2 分鐘前')).toBeInTheDocument()
  // 到了回顧只代表回顧開始了，回顧與反思欄跟著 review_status，不因 overall=done 就寫已完成
  expect(within(within(table).getByRole('row', { name: /小博/ })).getByText('進行中')).toBeInTheDocument()
  expect(within(table).getByText('⏸ 2 分鐘沒有動作')).toBeInTheDocument()
  expect(within(page).getByText('看不到對話內容；學生確認過的想法在『統計分析』')).toBeInTheDocument()
})

test.each([
  ['zh-Hant' as const, '選擇立場中'],
  ['en' as const, 'Choosing a stance'],
  ['es' as const, 'Eligiendo postura'],
])('%s: a student still choosing a stance is not shown as in dialogue', async (locale, label) => {
  const choosing = { ...progress.students[0], cells: [{ status: 'confirmed', turns: null }, { status: 'choosing_stance', turns: null }] } as Progress['students'][number]
  open({ locale, view: { ...progress, students: [choosing] } })
  const table = within(await screen.findByTestId('teacher-live-page')).getByRole('table')
  expect(within(table).getByText(label)).toHaveClass('live-cell--choosing_stance')
  expect(within(table).queryByText(/0 (輪|turns?|turnos?)/)).toBeNull()
})

test('filters students and shows a count on every filter', async () => {
  open()
  const page = await screen.findByTestId('teacher-live-page')
  const group = within(page).getByRole('group', { name: '篩選學生' })
  for (const label of ['全部 4', '對話中 2', '需要留意 1', '已完成 1', '還沒開始 1']) {
    expect(within(group).getByRole('button', { name: label })).toBeInTheDocument()
  }

  fireEvent.click(within(group).getByRole('button', { name: '需要留意 1' }))
  expect(within(page).getByRole('row', { name: /小安/ })).toBeInTheDocument()
  expect(within(page).queryByRole('row', { name: /小博/ })).toBeNull()

  fireEvent.click(within(group).getByRole('button', { name: '還沒開始 1' }))
  expect(within(page).getByRole('row', { name: /小慈/ })).toBeInTheDocument()
  expect(within(page).queryByRole('row', { name: /小安/ })).toBeNull()
})

test('reloads progress every ten seconds', async () => {
  jest.useFakeTimers()
  const calls = open()
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  expect(calls.filter(call => call.key === 'GET /solo/activities/a-1/progress')).toHaveLength(1)

  await act(async () => { jest.advanceTimersByTime(10_000); await Promise.resolve() })
  expect(calls.filter(call => call.key === 'GET /solo/activities/a-1/progress')).toHaveLength(2)
})

test.each([
  [['end_now'] as Activity['available_actions'], true],
  [[], false],
])('shows end early only when available_actions allows it: %p', async (actions, visible) => {
  open({ actions })
  const page = await screen.findByTestId('teacher-live-page')
  expect(within(page).queryByRole('button', { name: '提早結束' }) !== null).toBe(visible)
})

test('confirms before ending and posts the state-machine action', async () => {
  const calls = open()
  const page = await screen.findByTestId('teacher-live-page')
  fireEvent.click(within(page).getByRole('button', { name: '提早結束' }))
  const dialog = screen.getByRole('dialog', { name: '提早結束活動' })
  expect(calls.some(call => call.key === 'POST /activities/a-1/end_now')).toBe(false)
  fireEvent.click(within(dialog).getByRole('button', { name: '確認結束' }))
  await waitFor(() => expect(calls.some(call => call.key === 'POST /activities/a-1/end_now')).toBe(true))
})

test.each([
  ['en' as const, { ...progress, title: 'Technology and Choice', course_name: 'Technology Ethics', questions: [{ index: 0, title: 'Trolley problem' }, { index: 1, title: 'Transplant' }], students: progress.students.map((student, index) => ({ ...student, display_name: ['Ana', 'Ben', 'Cora', 'Dan'][index] })) }],
  ['es' as const, { ...progress, title: 'Tecnología y elección', course_name: 'Ética tecnológica', questions: [{ index: 0, title: 'El tranvía' }, { index: 1, title: 'Trasplante' }], students: progress.students.map((student, index) => ({ ...student, display_name: ['Ana', 'Beto', 'Cora', 'Dani'][index] })) }],
])('%s live page contains no Chinese interface text', async (locale, view) => {
  open({ locale, view })
  const page = await screen.findByTestId('teacher-live-page')
  expect(page.textContent).not.toMatch(/[\u3400-\u9fff]/)
})
