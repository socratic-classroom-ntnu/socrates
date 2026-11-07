import { act, fireEvent, screen, within } from '@testing-library/react'
import type { components } from '../../../contract/classroomTypes'
import { api } from '../../../contract/classroomClient'
import { applyLocale } from '../../../i18n'
import { mockApi, renderAt, signedIn } from '../../../testing/pageHarness'
import { TeacherAnalysisPage } from './TeacherAnalysisPage'

jest.mock('../../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../../contract/classroomClient')>('../../../contract/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})

type Analysis = components['schemas']['SoloActivityAnalysisView']
type Activity = components['schemas']['ActivityTeacherView']
type Student = components['schemas']['SoloAnalysisStudentView']

const student = (index: number, extra: Partial<Student> = {}): Student => ({
  enrollment_id: `e-${index}`,
  display_name: `學生${index}`,
  confirmed_scenarios: 1,
  current_position: `立場${index}`,
  reason_summary: `理由${index}`,
  relevant_conditions: [],
  ...extra,
})

const analysis: Analysis = {
  activity_id: 'a-1', title: '科技與選擇', course_id: 'c-1', course_name: '科技倫理',
  status: 'open', ends_at: 1_800_003_600, generated_at: 1_800_000_000, revision_id: 'r-1',
  summary: { enrolled: 18, started: 18, done: 9, in_progress: 9 },
  students: [
    student(1, { confirmed_scenarios: 2, relevant_conditions: ['不會波及更多人', '沒有其他選擇'] }),
    ...Array.from({ length: 5 }, (_, index) => student(index + 2)),
    student(7, { confirmed_scenarios: 0, display_name: '還沒確認的人' }),
  ],
}

function activity(actions: Activity['available_actions'] = ['end_now']): Activity {
  return {
    id: 'a-1', course_id: 'c-1', status: 'open', locked: true, has_unpublished_changes: false,
    revision: 1, draft: { title: analysis.title, ends_at: analysis.ends_at! },
    starts_at: 1_799_999_000, ends_at: analysis.ends_at, available_actions: actions,
  }
}

function progress() {
  return {
    activity_id: analysis.activity_id, title: analysis.title, course_id: analysis.course_id, course_name: analysis.course_name,
    status: analysis.status, ends_at: analysis.ends_at, generated_at: analysis.generated_at,
    summary: { enrolled: 18, started: 18, done: 9, attention: 0 }, students: [],
  }
}

function open(options: { actions?: Activity['available_actions']; locale?: 'zh-Hant' | 'en' | 'es'; view?: Analysis; source?: 'api' | 'demo' } = {}) {
  const calls = mockApi({
    'GET /auth/me': { ...signedIn, locale: options.locale ?? 'zh-Hant' },
    'GET /solo/activities/a-1/analysis': options.view ?? analysis,
    'GET /solo/activities/a-1/progress': progress(),
    'GET /activities/a-1': activity(options.actions),
    'POST /activities/a-1/end_now': {},
  })
  renderAt('/teach/activities/a-1/analysis', '/teach/activities/:activityId/analysis', <TeacherAnalysisPage source={options.source} />)
  return calls
}

beforeEach(() => jest.mocked(api).mockReset())
afterEach(() => { jest.useRealTimers(); void applyLocale('zh-Hant') })

test('renders overview cards from summary', async () => {
  open()
  const page = await screen.findByTestId('teacher-analysis-page')
  expect(within(page).getByText('已開始 18 ／ 18')).toBeInTheDocument()
  expect(within(page).getByText('還有 0 人沒開始')).toBeInTheDocument()
  expect(within(page).getByText('完成 9 人')).toBeInTheDocument()
  expect(within(page).getByText('還在對話中 9 人')).toBeInTheDocument()
  expect(within(page).queryByText(/示意資料/)).toBeNull()
})

test('shares header and tabs with live page', async () => {
  open()
  const page = await screen.findByTestId('teacher-analysis-page')
  expect(within(page).getByRole('link', { name: '課程' })).toHaveAttribute('href', '/teach/courses/c-1')
  expect(within(page).getByRole('heading', { name: '科技與選擇' })).toBeInTheDocument()
  expect(within(page).getByText('進行中', { selector: '.status-pill' })).toBeInTheDocument()
  expect(within(page).getByRole('link', { name: '統計分析' })).toHaveAttribute('aria-current', 'page')
  expect(within(page).getByRole('link', { name: '即時狀況' })).toHaveAttribute('href', '/teach/activities/a-1')
  expect(within(page).getByRole('link', { name: 'AI 分析（開發中）' })).toHaveAttribute('href', '/teach/activities/a-1/analysis/ai')
})

test('end early only with end_now action', async () => {
  open({ actions: [] })
  const page = await screen.findByTestId('teacher-analysis-page')
  expect(within(page).queryByRole('button', { name: '提早結束' })).toBeNull()
})

test('lists the confirmed viewpoint of each student who has one', async () => {
  open()
  const list = await screen.findByRole('region', { name: '學生確認過的想法' })
  expect(within(list).getByText('6 人有確認過的想法')).toBeInTheDocument()
  expect(within(list).getByText('學生1')).toBeInTheDocument()
  expect(within(list).getByText('已確認 2 個情境')).toBeInTheDocument()
  expect(within(list).getByText('立場1')).toBeInTheDocument()
  expect(within(list).getByText('理由1')).toBeInTheDocument()
  expect(within(list).getByText('條件：不會波及更多人；沒有其他選擇')).toBeInTheDocument()
  // 還沒確認任何情境的學生沒有可以顯示的想法
  expect(within(list).queryByText('還沒確認的人')).toBeNull()
})

test('shows four students then expands to all', async () => {
  open()
  expect(await screen.findByText('學生4')).toBeInTheDocument()
  expect(screen.queryByText('學生5')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '看全部 6 人' }))
  expect(screen.getByText('學生5')).toBeInTheDocument()
  expect(screen.getByText('學生6')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /看全部/ })).toBeNull()
})

test('shows an empty note when nobody has confirmed a viewpoint', async () => {
  open({ view: { ...analysis, students: [student(1, { confirmed_scenarios: 0 })] } })
  expect(await screen.findByText('還沒有人確認過想法')).toBeInTheDocument()
})

test('students are not links', async () => {
  open()
  const list = await screen.findByRole('region', { name: '學生確認過的想法' })
  expect(within(list).queryByRole('link')).toBeNull()
})

test('refreshes every 10 seconds and keeps the expanded list', async () => {
  jest.useFakeTimers()
  const calls = open()
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  fireEvent.click(screen.getByRole('button', { name: '看全部 6 人' }))
  await act(async () => { jest.advanceTimersByTime(10_000); await Promise.resolve() })
  expect(calls.filter(call => call.key === 'GET /solo/activities/a-1/analysis')).toHaveLength(2)
  expect(screen.getByText('學生6')).toBeInTheDocument()
})

test('demo source shows the sample banner and skips the api', async () => {
  const calls = open({ source: 'demo' })
  expect(await screen.findByText(/示意資料：統計功能還在完成中/)).toBeInTheDocument()
  expect(calls.some(call => call.key === 'GET /solo/activities/a-1/analysis')).toBe(false)
})

test.each(['en' as const, 'es' as const])('%s contains no Chinese interface text', async locale => {
  open({ locale, view: {
    ...analysis, title: 'Technology and Choice', course_name: 'Technology Ethics',
    students: analysis.students.map(item => ({
      ...item, display_name: `Student ${item.enrollment_id}`, current_position: 'Position', reason_summary: 'Reason',
      relevant_conditions: item.relevant_conditions.map(() => 'Condition'),
    })),
  } })
  const page = await screen.findByTestId('teacher-analysis-page')
  expect(page.textContent).not.toMatch(/[㐀-鿿]/)
})
