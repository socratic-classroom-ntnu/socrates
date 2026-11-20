import { act, fireEvent, screen, within } from '@testing-library/react'
import type { components } from '../../../contract/classroomTypes'
import { api } from '../../../contract/classroomClient'
import { applyLocale } from '../../../i18n'
import { mockApi, renderAt, signedIn } from '../../../testing/pageHarness'
import { TeacherAnalysisPage } from './TeacherAnalysisPage'
import { PROJECTOR_WINDOW_NAME } from './projectorNavigation'

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
  kind: 'registered',
  guest_number: null, final_status: null,
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
    revision: 1, draft: { title: analysis.title, scenario: '一輛失控的電車正駛向五名工人。', ends_at: analysis.ends_at! },
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

beforeEach(() => {
  jest.mocked(api).mockReset()
  jest.spyOn(window, 'open').mockImplementation(() => null)
})
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); void applyLocale('zh-Hant') })

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
  expect(within(page).getByText('進行中', { selector: '.pill' })).toBeInTheDocument()
  expect(within(page).getByRole('link', { name: '統計分析' })).toHaveAttribute('aria-current', 'page')
  expect(within(page).getByRole('link', { name: '即時狀況' })).toHaveAttribute('href', '/teach/activities/a-1')
  expect(within(page).getByRole('link', { name: 'AI 分析（開發中）' })).toHaveAttribute('href', '/teach/activities/a-1/analysis/ai')
  const projectorButton = within(page).getByRole('button', { name: '投影活動 QR' })
  fireEvent.click(projectorButton)
  const inviteDialog = screen.getByRole('dialog', { name: '邀請學生參加「科技與選擇」' })
  const projectorLink = within(inviteDialog).getByRole('link', { name: '投影到大螢幕' })
  expect(projectorLink).toHaveAttribute('target', PROJECTOR_WINDOW_NAME)
  expect(window.open).not.toHaveBeenCalled()
  fireEvent.click(projectorLink)
  expect(window.open).toHaveBeenCalledWith('/teach/activities/a-1/projector', PROJECTOR_WINDOW_NAME)
  expect(screen.getByTestId('where')).toHaveTextContent('/teach/activities/a-1/analysis')
  expect(screen.getByRole('dialog', { name: '邀請學生參加「科技與選擇」' })).toBeInTheDocument()
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

test('guest viewpoints carry a guest tag and expired guests show an anonymous number', async () => {
  open({ view: { ...analysis, students: [
    student(1),
    student(2, { display_name: '阿明', kind: 'guest', guest_number: 1 }),
    student(3, { display_name: '', kind: 'expired_guest', guest_number: 2 }),
  ] } })
  const page = await screen.findByTestId('teacher-analysis-page')
  const registered = within(page).getByText('學生1').closest('.analysis-student') as HTMLElement
  expect(within(registered).queryByText('訪客')).toBeNull()
  const guest = within(page).getByText('阿明').closest('.analysis-student') as HTMLElement
  expect(within(guest).getByText('訪客')).toBeInTheDocument()
  const expired = within(page).getByText('過期訪客 2').closest('.analysis-student') as HTMLElement
  expect(within(expired).getByText('訪客')).toBeInTheDocument()
})

describe('a field the student has not written yet', () => {
  test('shows grey 「（還沒說明）」 in place of an empty position or reason', async () => {
    open({ view: { ...analysis, students: [
      student(1, { current_position: '', reason_summary: '理由1' }),
      student(2, { current_position: '立場2', reason_summary: '' }),
      student(3, { current_position: '', reason_summary: '' }),
    ] } })
    const list = await screen.findByRole('region', { name: '學生確認過的想法' })
    const rows = (name: string) => within(list).getByText(name).closest('.analysis-student') as HTMLElement
    expect(within(rows('學生1')).getAllByText('（還沒說明）')).toHaveLength(1)
    expect(within(rows('學生1')).getByText('（還沒說明）')).toHaveClass('analysis-student__blank')
    expect(within(rows('學生1')).getByText('理由1')).toBeInTheDocument()
    expect(within(rows('學生2')).getAllByText('（還沒說明）')).toHaveLength(1)
    expect(within(rows('學生2')).getByText('立場2')).toBeInTheDocument()
    expect(within(rows('學生3')).getAllByText('（還沒說明）')).toHaveLength(2)
  })

  test('a viewpoint with both fields written has no grey words', async () => {
    open()
    const list = await screen.findByRole('region', { name: '學生確認過的想法' })
    expect(within(list).queryByText('（還沒說明）')).toBeNull()
  })

  test.each([
    ['en' as const, '(Not explained yet)'],
    ['es' as const, '(Aún sin explicar)'],
  ])('%s: the grey words are in that language', async (locale, words) => {
    open({ locale, view: { ...analysis, students: [student(1, { current_position: '', reason_summary: '' })] } })
    expect((await screen.findAllByText(words)).length).toBe(2)
    expect(screen.queryByText('（還沒說明）')).toBeNull()
  })
})
