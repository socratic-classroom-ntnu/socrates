import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ApiError } from '../../contract/classroomClient'
import { AppRoutes } from '../../app/routes'
import { AuthProvider } from '../auth/AuthContext'
import { applyLocale } from '../../i18n'
import { mockApi, Where } from '../../testing/pageHarness'

jest.mock('../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../contract/classroomClient')>('../../contract/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})
jest.mock('../../app/legacyRoutes', () => ({
  LegacyClassroomRoute: () => null,
  LegacyTeacherCourseRoute: () => null,
  LegacyTeacherRoute: () => null,
}))

const activity = {
  activity_id: 'a-1', title: '第三週倫理討論', course_id: 'c-1', course_name: '哲學導論',
  status: 'open', ends_at: 1_782_317_940, attempt: null,
}

const attempt = {
  id: 'attempt-1', state: 'in_dialogue', scenario_index: 0, current_turn: 0, review_status: 'not_started',
  progress: [{ index: 0, status: 'in_dialogue' }],
}

function renderPage() {
  return render(<MemoryRouter initialEntries={['/learn/activities/a-1']}>
    <AuthProvider><AppRoutes /><Where /></AuthProvider>
  </MemoryRouter>)
}

beforeEach(async () => {
  await applyLocale('zh-Hant')
})

test('before an attempt the page shows one scenario that has not started and no question count', async () => {
  mockApi({ 'GET /solo/activities/a-1': activity })
  renderPage()

  expect(await screen.findByRole('heading', { level: 1, name: '第三週倫理討論' })).toBeInTheDocument()
  const progress = screen.getByRole('region', { name: '你的進度' })
  const rows = within(progress).getAllByRole('listitem')
  expect(rows).toHaveLength(2)
  expect(rows[0]).toHaveTextContent('情境 1')
  expect(rows[0]).toHaveTextContent('還沒開始')
  expect(rows[1]).toHaveTextContent('回顧與最後反思')
  expect(screen.queryByText('題目')).toBeNull()
  expect(screen.getByText('先讀情境，用自己的話回答')).toBeInTheDocument()
})

test('breadcrumb: 課程 goes home, the course name goes to the course', async () => {
  mockApi({ 'GET /solo/activities/a-1': activity })
  renderPage()

  const path = await screen.findByRole('navigation', { name: '課程路徑' }, { timeout: 5000 })
  expect(within(path).getByRole('link', { name: '課程' })).toHaveAttribute('href', '/?tab=learn')
  expect(within(path).getByRole('link', { name: '哲學導論' })).toHaveAttribute('href', '/learn/courses/c-1')
})

test('back arrow returns to the course', async () => {
  mockApi({ 'GET /solo/activities/a-1': activity })
  renderPage()

  expect(await screen.findByRole('link', { name: '返回上一層' }, { timeout: 3000 })).toHaveAttribute('href', '/learn/courses/c-1')
})

test('activity page shows the scenarios reached so far', async () => {
  mockApi({
    'GET /solo/activities/a-1': {
      ...activity,
      attempt: {
        ...attempt, scenario_index: 1,
        progress: [
          { index: 0, status: 'confirmed' },
          { index: 1, status: 'in_dialogue' },
        ],
      },
    },
  })
  renderPage()

  const progress = await screen.findByRole('region', { name: '你的進度' }, { timeout: 5000 })
  const rows = within(progress).getAllByRole('listitem')
  expect(rows).toHaveLength(3)
  expect(rows[0]).toHaveTextContent('情境 1')
  expect(rows[0]).toHaveTextContent('已確認')
  expect(rows[1]).toHaveTextContent('情境 2')
  expect(rows[1]).toHaveTextContent('對話中')
  expect(rows[2]).toHaveTextContent('回顧與最後反思')
  expect(rows[2]).toHaveTextContent('還沒開始')
})

test('continue card shows scenario and turn', async () => {
  // current_turn is the scenario's turn_index: the first answer is turn 0, so turn 2 is the third round.
  mockApi({ 'GET /solo/activities/a-1': { ...activity, attempt: { ...attempt, scenario_index: 1, current_turn: 2 } } })
  renderPage()

  const card = await screen.findByRole('complementary', {}, { timeout: 5000 })
  expect(within(card).getByText('上次停在')).toBeInTheDocument()
  expect(within(card).getByText('情境 2，第 3 輪對話')).toBeInTheDocument()
  expect(within(card).getByRole('button', { name: '繼續對話' })).toBeInTheDocument()
  expect(within(card).queryByText(/用你自己的話說你會怎麼做/)).toBeNull()
})

test('reviewing card says every scenario is confirmed', async () => {
  mockApi({
    'GET /solo/activities/a-1': {
      ...activity,
      attempt: {
        ...attempt, state: 'reviewing', scenario_index: 1, review_status: 'in_progress',
        progress: [
          { index: 0, status: 'confirmed' },
          { index: 1, status: 'confirmed' },
        ],
      },
    },
  })
  renderPage()

  const card = await screen.findByRole('complementary', {}, { timeout: 5000 })
  expect(within(card).getByText('情境都確認了，下一步是觀點回顧')).toBeInTheDocument()
  expect(within(card).queryByText(/輪對話/)).toBeNull()
  const rows = within(screen.getByRole('region', { name: '你的進度' })).getAllByRole('listitem')
  expect(rows[2]).toHaveTextContent('回顧與最後反思')
  expect(rows[2]).toHaveTextContent('進行中')
})

test('start posts the attempt then opens the dialogue', async () => {
  let started = false
  const calls = mockApi({
    'GET /solo/activities/a-1': () => started
      ? { ...activity, attempt: { ...attempt, state: 'answering' } }
      : activity,
    'POST /solo/activities/a-1/attempt': () => { started = true; return { id: 'attempt-1' } },
  })
  renderPage()

  const start = await screen.findByRole('button', { name: '開始對話' })
  await act(async () => { fireEvent.click(start) })

  expect(calls).toContainEqual({ key: 'POST /solo/activities/a-1/attempt', body: undefined })
  await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/learn/activities/a-1/dialogue'))
})

test('expired session on start asks for a reload instead of a generic error', async () => {
  mockApi({
    'GET /solo/activities/a-1': activity,
    'POST /solo/activities/a-1/attempt': () => { throw new ApiError(403, 'SESSION_CSRF_REQUIRED') },
  })
  renderPage()

  // The first render in a run loads the solo namespace, which can take longer than 1 s.
  const start = await screen.findByRole('button', { name: '開始對話' }, { timeout: 5000 })
  await act(async () => { fireEvent.click(start) })

  expect(await screen.findByRole('alert')).toHaveTextContent('登入狀態已過期，請重新整理頁面。')
})

test('existing attempt shows continue', async () => {
  mockApi({ 'GET /solo/activities/a-1': { ...activity, attempt } })
  renderPage()

  const resume = await screen.findByRole('button', { name: '繼續對話' })
  expect(screen.queryByRole('button', { name: '開始對話' })).toBeNull()
  fireEvent.click(resume)
  await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/learn/activities/a-1/dialogue'))
})

test('closed activity has no start button', async () => {
  mockApi({ 'GET /solo/activities/a-1': { ...activity, status: 'ended' } })
  renderPage()

  expect(await screen.findByRole('heading', { level: 1, name: '第三週倫理討論' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '開始對話' })).toBeNull()
  expect(screen.getByText('這個活動目前不能開始。')).toBeInTheDocument()
})

test('unknown activity shows not found', async () => {
  mockApi({ 'GET /solo/activities/a-1': () => { throw new ApiError(404, 'ACTIVITY_NOT_FOUND') } })
  renderPage()

  expect(await screen.findByRole('heading', { name: '找不到這個活動' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '回到首頁' })).toHaveAttribute('href', '/')
})
