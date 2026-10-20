import { act, fireEvent, screen, within } from '@testing-library/react'
import type { components } from '../../api/classroomTypes'
import { api } from '../../api/classroomClient'
import { applyLocale } from '../../i18n'
import { mockApi, renderAt, signedIn } from '../../testing/pageHarness'
import { TeacherAnalysisPage } from './TeacherAnalysisPage'

jest.mock('../../api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../api/classroomClient')>('../../api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})

type Analysis = components['schemas']['SoloActivityAnalysisView']
type Activity = components['schemas']['ActivityTeacherView']
type Student = components['schemas']['SoloAnalysisStudentView']

const student = (index: number, extra: Partial<Student> = {}): Student => ({
  enrollment_id: `e-${index}`,
  display_name: `學生${index}`,
  changed_from_option_id: null,
  reason_summary: `理由${index}`,
  relevant_conditions: [],
  ...extra,
})

const analysis: Analysis = {
  activity_id: 'a-1', title: '科技與選擇', course_id: 'c-1', course_name: '科技倫理',
  status: 'open', question_count: 2, ends_at: 1_800_003_600, generated_at: 1_800_000_000, revision_id: 'r-1',
  summary: { enrolled: 18, started: 18, done: 9, in_progress: 9 },
  questions: [
    {
      index: 0, question_id: 'q-1', title: '岔道上的選擇', confirmed: 14, unconfirmed: 4, changed: 3, comparable: 14,
      options: [
        { option_id: 'a', text: '拉下拉桿', count: 6, students: Array.from({ length: 6 }, (_, index) => student(index + 1, index === 0 ? { relevant_conditions: ['不會波及更多人', '沒有其他選擇'] } : {})) },
        { option_id: 'b', text: '不拉', count: 8, students: [student(7, { changed_from_option_id: 'a', display_name: '小安' })] },
        { option_id: 'c', text: '其他', count: 0, students: [] },
      ],
    },
    {
      index: 1, question_id: 'q-2', title: '天橋上的陌生人', confirmed: 0, unconfirmed: 18, changed: 0, comparable: 0,
      options: [
        { option_id: 'x', text: '推下去', count: 0, students: [] },
        { option_id: 'y', text: '不推', count: 0, students: [] },
      ],
    },
  ],
}

function activity(actions: Activity['available_actions'] = ['end_now']): Activity {
  return {
    id: 'a-1', course_id: 'c-1', status: 'open', locked: true, has_unpublished_changes: false,
    revision: 1, draft: { title: analysis.title, topic_direction: '', analysis_focus: '', ends_at: analysis.ends_at!, questions: [] },
    starts_at: 1_799_999_000, ends_at: analysis.ends_at, available_actions: actions,
  }
}

function progress() {
  return {
    activity_id: analysis.activity_id, title: analysis.title, course_id: analysis.course_id, course_name: analysis.course_name,
    status: analysis.status, question_count: analysis.question_count, ends_at: analysis.ends_at, generated_at: analysis.generated_at,
    summary: { enrolled: 18, started: 18, done: 9, unconfirmed_by_question: [4, 18], attention: 0 }, questions: [], students: [],
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

test('question tabs switch the option list', async () => {
  open()
  const page = await screen.findByTestId('teacher-analysis-page')
  expect(within(page).getByRole('button', { name: /A 拉下拉桿/ })).toBeInTheDocument()
  fireEvent.click(within(page).getByRole('tab', { name: '題目 2 · 天橋上的陌生人' }))
  expect(within(page).getByRole('button', { name: /A 推下去/ })).toBeInTheDocument()
  expect(within(page).queryByRole('button', { name: /拉下拉桿/ })).toBeNull()
})

test('confirmed line states unconfirmed are excluded', async () => {
  open()
  expect(await screen.findByText('已確認 14 人 · 另有 4 人還沒確認這一題，不算進任何選項')).toBeInTheDocument()
})

test('changed stance line shows comparable denominator', async () => {
  open()
  expect(await screen.findByText('改變立場 3 人（14 人可比較）')).toBeInTheDocument()
})

test('option bars show count and percent including empty options', async () => {
  open()
  const page = await screen.findByTestId('teacher-analysis-page')
  expect(within(page).getByRole('button', { name: /A 拉下拉桿 · 6 人 · 43%/ })).toBeInTheDocument()
  expect(within(page).getByRole('button', { name: /C 其他 · 0 人 · 0%/ })).toBeInTheDocument()
  fireEvent.click(within(page).getByRole('tab', { name: '題目 2 · 天橋上的陌生人' }))
  expect(within(page).getByRole('button', { name: /A 推下去 · 0 人 · 0%/ })).toBeInTheDocument()
})

test('expanding an option lists students with reason and conditions', async () => {
  open()
  const button = await screen.findByRole('button', { name: /A 拉下拉桿/ })
  fireEvent.click(button)
  expect(button).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText('學生1')).toBeInTheDocument()
  expect(screen.getByText('理由1')).toBeInTheDocument()
  expect(screen.getByText('條件：不會波及更多人；沒有其他選擇')).toBeInTheDocument()
})

test('changed student shows from-to tag by letter', async () => {
  open()
  fireEvent.click(await screen.findByRole('button', { name: /B 不拉/ }))
  expect(screen.getByText('從 A 改為 B')).toBeInTheDocument()
  expect(screen.getAllByText('從 A 改為 B')).toHaveLength(1)
})

test('shows four students then expands to all', async () => {
  open()
  fireEvent.click(await screen.findByRole('button', { name: /A 拉下拉桿/ }))
  expect(screen.getByText('學生4')).toBeInTheDocument()
  expect(screen.queryByText('學生5')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '看全部 6 人' }))
  expect(screen.getByText('學生5')).toBeInTheDocument()
  expect(screen.getByText('學生6')).toBeInTheDocument()
})

test('students are not links', async () => {
  open()
  fireEvent.click(await screen.findByRole('button', { name: /A 拉下拉桿/ }))
  const list = screen.getByRole('region', { name: '選擇 A 的學生' })
  expect(within(list).queryByRole('link')).toBeNull()
})

test('refreshes every 10 seconds and keeps selection', async () => {
  jest.useFakeTimers()
  const calls = open()
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  fireEvent.click(screen.getByRole('tab', { name: '題目 2 · 天橋上的陌生人' }))
  const option = screen.getByRole('button', { name: /A 推下去/ })
  fireEvent.click(option)
  await act(async () => { jest.advanceTimersByTime(10_000); await Promise.resolve() })
  expect(calls.filter(call => call.key === 'GET /solo/activities/a-1/analysis')).toHaveLength(2)
  expect(screen.getByRole('tab', { name: '題目 2 · 天橋上的陌生人' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('button', { name: /A 推下去/ })).toHaveAttribute('aria-expanded', 'true')
})

test('demo source shows the sample banner and skips the api', async () => {
  const calls = open({ source: 'demo' })
  expect(await screen.findByText(/示意資料：統計功能還在完成中/)).toBeInTheDocument()
  expect(calls.some(call => call.key === 'GET /solo/activities/a-1/analysis')).toBe(false)
})

test.each(['en' as const, 'es' as const])('%s contains no Chinese interface text', async locale => {
  open({ locale, view: {
    ...analysis, title: 'Technology and Choice', course_name: 'Technology Ethics',
    questions: analysis.questions.map((question, index) => ({ ...question, title: index ? 'Bridge' : 'Trolley', options: question.options.map(option => ({ ...option, text: option.option_id })) })),
  } })
  const page = await screen.findByTestId('teacher-analysis-page')
  expect(page.textContent).not.toMatch(/[\u3400-\u9fff]/)
})
