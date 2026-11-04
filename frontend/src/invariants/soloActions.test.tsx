import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../app/routes'
import { AuthProvider } from '../features/auth/AuthContext'
import { applyLocale } from '../i18n'
import { mockApi, signedIn } from '../testing/pageHarness'

// 不可妥協條款：available_actions 由後端決定。單人活動的按鈕只看後端給的動作，不從 state 推導。
jest.mock('../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../contract/classroomClient')>('../contract/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})
jest.mock('../app/legacyRoutes', () => ({
  LegacyClassroomRoute: () => null,
  LegacyTeacherCourseRoute: () => null,
  LegacyTeacherRoute: () => null,
}))

const activity = {
  activity_id: 'a-1', title: '倫理討論', course_id: 'c-1', course_name: '哲學導論',
  status: 'open', question_count: 1, ends_at: 1_782_317_940,
  attempt: { id: 'attempt-1', state: 'choosing_stance', question_index: 0 },
}
const attempt = {
  id: 'attempt-1', activity_id: 'a-1', activity_title: '倫理討論',
  course_id: 'c-1', course_name: '哲學導論', display_name: '小華', state: 'choosing_stance',
  question_index: 0, question_count: 1,
  questions: [{
    index: 0, id: 'q-1', title: '岔道上的選擇', scenario: '一輛失控的電車正駛向五名工人。',
    options: [{ id: 'o-a', text: '拉下拉桿' }, { id: 'o-b', text: '不拉' }],
    stance: null, status: 'in_progress', confirmed_summary: null,
  }],
  messages: [], candidate_summary: null, summary_digest: null, principle_hint: null,
  notice: null, available_actions: ['submit_stance'],
}

function renderAttempt(availableActions: string[]) {
  mockApi({
    'GET /auth/me': { ...signedIn, locale: 'zh-Hant' },
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': { ...attempt, available_actions: availableActions },
  })
  render(<MemoryRouter initialEntries={['/learn/activities/a-1/dialogue']}>
    <AuthProvider><AppRoutes /></AuthProvider>
  </MemoryRouter>)
}

beforeEach(async () => {
  localStorage.clear()
  await applyLocale('zh-Hant')
})

describe('單人活動的按鈕（不可妥協：前端不推導狀態）', () => {
  it('狀態相同時，後端給了動作才出現對應的控制', async () => {
    renderAttempt(['submit_stance'])
    expect(await screen.findByLabelText('為什麼？')).toBeInTheDocument()
  })

  it('後端沒給動作，就算 state 是 choosing_stance 也不顯示任何控制', async () => {
    renderAttempt([])
    expect(await screen.findByText(/小華，先讀一讀黑板上的情境/)).toBeInTheDocument()
    expect(screen.queryByLabelText('為什麼？')).toBeNull()
    expect(screen.queryByRole('button', { name: '送出' })).toBeNull()
  })
})
