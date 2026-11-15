import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ApiError } from '../../contract/classroomClient'
import { AppRoutes } from '../../app/routes'
import { AuthProvider } from '../auth/AuthContext'
import { applyLocale } from '../../i18n'
import { readableText } from '../auth/testText'
import { mockApi, signedIn, Where } from '../../testing/pageHarness'

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
  status: 'open', ends_at: 1_782_317_940,
  attempt: { id: 'attempt-1', state: 'answering', scenario_index: 0 },
}
const scenario = '一輛失控的電車正駛向五名工人。\n你可以拉下拉桿，讓電車轉向另一條軌道。'
const firstScenario = {
  index: 0, id: 's1', text: scenario, answer: null, status: 'in_progress', confirmed_summary: null,
}
const attempt = {
  id: 'attempt-1', activity_id: 'a-1', activity_title: '第三週倫理討論',
  course_id: 'c-1', course_name: '哲學導論', display_name: '小華', state: 'answering',
  scenario_index: 0, scenarios: [firstScenario],
  messages: [], candidate_summary: null, summary_digest: null, principle_hint: null,
  revising: false, rejected_summary: null,
  notice: null, available_actions: ['send_message'],
}

type FakeRecognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start(): void
  stop(): void
}

let recognitionInstances: FakeRecognition[] = []

function enableSpeechRecognition() {
  class Recognition implements FakeRecognition {
    lang = ''
    continuous = false
    interimResults = false
    onresult: FakeRecognition['onresult'] = null
    onend: FakeRecognition['onend'] = null
    onerror: FakeRecognition['onerror'] = null
    constructor() { recognitionInstances.push(this) }
    start() {}
    stop() { this.onend?.() }
  }
  Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: Recognition })
}

function deliverTranscript(recognition: FakeRecognition, transcript: string) {
  recognition.onresult?.({ resultIndex: 0, results: [[{ transcript }]] })
}

function renderPage(routes: Record<string, unknown>, locale = 'zh-Hant') {
  mockApi({ 'GET /auth/me': { ...signedIn, locale }, ...routes })
  return render(<MemoryRouter initialEntries={['/learn/activities/a-1/dialogue']}>
    <AuthProvider><AppRoutes /><Where /></AuthProvider>
  </MemoryRouter>)
}

function renderPageWithCalls(routes: Record<string, unknown>) {
  const calls = mockApi({ 'GET /auth/me': signedIn, ...routes })
  render(<MemoryRouter initialEntries={['/learn/activities/a-1/dialogue']}>
    <AuthProvider><AppRoutes /><Where /></AuthProvider>
  </MemoryRouter>)
  return calls
}

beforeEach(async () => {
  jest.useRealTimers()
  localStorage.clear()
  recognitionInstances = []
  Reflect.deleteProperty(window, 'SpeechRecognition')
  Reflect.deleteProperty(window, 'webkitSpeechRecognition')
  await applyLocale('zh-Hant')
})

test('dialogue shows scenario verbatim and the fixed opening', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': attempt,
  })

  const renderedScenario = await screen.findByText((_, node) => node?.textContent === scenario)
  expect(renderedScenario.textContent).toBe(scenario)
  expect(screen.getByText(/小華，先讀一讀黑板上的情境/)).toBeInTheDocument()
})

test('every Socrates message carries the avatar, like the opening', async () => {
  const { container } = renderPage({
    'GET /solo/activities/a-1': { ...activity, attempt: { ...activity.attempt, state: 'in_dialogue' } },
    'GET /solo/attempts/attempt-1': {
      ...attempt,
      state: 'in_dialogue',
      scenarios: [{ ...firstScenario, answer: '不能主動害人' }],
      messages: [
        { id: 'm-1', scenario_index: 0, role: 'student', text: '不能主動害人', created_at: 1 },
        { id: 'm-2', scenario_index: 0, role: 'tutor', text: '「主動」指的是什麼？', created_at: 2 },
      ],
      available_actions: ['send_message'],
    },
  })

  await screen.findByText('「主動」指的是什麼？')
  const tutorMessages = Array.from(container.querySelectorAll('.solo-message--tutor'))
  expect(tutorMessages).toHaveLength(2)
  for (const message of tutorMessages) {
    expect(message.querySelector('.solo-message__avatar')).not.toBeNull()
  }
})

test('hypothetical move shows the scenario tag', async () => {
  renderPage({
    'GET /solo/activities/a-1': { ...activity, attempt: { ...activity.attempt, state: 'in_dialogue' } },
    'GET /solo/attempts/attempt-1': {
      ...dialogueAttempt,
      messages: [
        ...dialogueAttempt.messages,
        {
          id: 'm-hypothetical', scenario_index: 0, role: 'tutor',
          text: '延伸情境：如果另一條軌道上的人也已經身處危險呢？', created_at: 3,
          move: 'hypothetical', revise_hint: null,
        },
      ],
    },
  })

  const reply = await screen.findByText('延伸情境：如果另一條軌道上的人也已經身處危險呢？')
  expect(reply.closest('article')).toHaveTextContent('換個情境想想 · 不改變原題')
})

test('the first answer is written in the same composer, in the student’s own words', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': attempt,
  })

  const input = await screen.findByLabelText('你的回答')
  expect(input).toBeEnabled()
  expect(screen.getByPlaceholderText('用你自己的話說說，你會怎麼做、為什麼…')).toBe(input)
  expect(screen.getByText('用自己的話回答就好，不用選立場，也沒有標準答案。草稿會自動保存。')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /拉下拉桿|不拉/ })).toBeNull()
  expect(screen.queryByRole('group', { name: '我的立場' })).toBeNull()
})

test('composer uses the A1 copy', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': dialogueAttempt,
  })

  expect(await screen.findByPlaceholderText('說說你的理由，或者你在猶豫什麼…')).toBeEnabled()
  expect(screen.getByText('不限回覆次數，慢慢想就好。訊息會先存下來，網路斷了也不會不見。')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '送出回答' })).toBeInTheDocument()
})

test('voice button is hidden when Web Speech is unsupported', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': dialogueAttempt,
  })

  await screen.findByLabelText('回答蘇格拉底')
  expect(screen.queryByRole('button', { name: '用說的' })).toBeNull()
})

test('voice transcript fills the composer without sending', async () => {
  enableSpeechRecognition()
  const calls = mockApi({
    'GET /auth/me': signedIn,
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': dialogueAttempt,
  })
  render(<MemoryRouter initialEntries={['/learn/activities/a-1/dialogue']}>
    <AuthProvider><AppRoutes /></AuthProvider>
  </MemoryRouter>)

  fireEvent.click(await screen.findByRole('button', { name: '用說的' }))
  expect(recognitionInstances).toHaveLength(1)
  expect(recognitionInstances[0].lang).toBe('zh-TW')
  act(() => deliverTranscript(recognitionInstances[0], '這是我說的理由。'))

  expect(screen.getByLabelText('回答蘇格拉底')).toHaveValue('這是我說的理由。')
  expect(calls.some(call => call.key.startsWith('POST'))).toBe(false)
})

test('voice transcript fills the first answer without submitting', async () => {
  enableSpeechRecognition()
  const calls = mockApi({
    'GET /auth/me': signedIn,
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': attempt,
  })
  render(<MemoryRouter initialEntries={['/learn/activities/a-1/dialogue']}>
    <AuthProvider><AppRoutes /></AuthProvider>
  </MemoryRouter>)

  fireEvent.click(await screen.findByRole('button', { name: '用說的' }))
  act(() => deliverTranscript(recognitionInstances[0], '我不想主動介入。'))

  expect(screen.getByLabelText('你的回答')).toHaveValue('我不想主動介入。')
  expect(calls.some(call => call.key.startsWith('POST'))).toBe(false)
})

test.each([
  ['zh-Hant', '用說的', 'zh-TW'],
  ['zh-Hans', '用说的', 'zh-CN'],
  ['en', 'Use voice', 'en-US'],
  ['es', 'Usar la voz', 'es-ES'],
] as const)('voice uses the %s interface language', async (locale, voiceLabel, expectedLanguage) => {
  enableSpeechRecognition()
  await applyLocale(locale)
  const localized = {
    ...dialogueAttempt,
    activity_title: 'Debate de ética', course_name: 'Filosofía', display_name: 'Ana',
    scenarios: [{ ...dialogueAttempt.scenarios[0], text: 'Un tranvía se acerca a cinco personas.' }],
    messages: [],
  }
  renderPage({
    'GET /solo/activities/a-1': { ...activity, title: 'Debate de ética', course_name: 'Filosofía' },
    'GET /solo/attempts/attempt-1': localized,
  }, locale)

  fireEvent.click(await screen.findByRole('button', { name: voiceLabel }))
  expect(recognitionInstances[0].lang).toBe(expectedLanguage)
})

test('voice button shows recording state, stops on a second press, and disables while waiting', async () => {
  enableSpeechRecognition()
  const page = renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': dialogueAttempt,
  })

  fireEvent.click(await screen.findByRole('button', { name: '用說的' }))
  const stop = screen.getByRole('button', { name: '停止錄音' })
  expect(stop).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(stop)
  expect(screen.getByRole('button', { name: '用說的' })).toHaveAttribute('aria-pressed', 'false')
  page.unmount()

  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': savedTurn,
  })
  expect(await screen.findByRole('button', { name: '用說的' })).toBeDisabled()
})

test('the answer composer and the reply composer share the upward arrow', async () => {
  const first = renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': attempt,
  })
  const answerSend = await screen.findByRole('button', { name: '送出回答' })
  expect(answerSend.querySelector('path')).toHaveAttribute('d', 'M12 19V5M6 11l6-6 6 6')
  first.unmount()

  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': dialogueAttempt,
  })
  const replySend = await screen.findByRole('button', { name: '送出回答' })
  expect(replySend.querySelector('path')).toHaveAttribute('d', 'M12 19V5M6 11l6-6 6 6')
})

test('the first answer posts send_message with only the text', async () => {
  const calls = mockApi({
    'GET /auth/me': signedIn,
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': attempt,
    'POST /solo/attempts/attempt-1/send_message': { ...attempt, state: 'awaiting_tutor', available_actions: [] },
  })
  render(<MemoryRouter initialEntries={['/learn/activities/a-1/dialogue']}>
    <AuthProvider><AppRoutes /></AuthProvider>
  </MemoryRouter>)

  fireEvent.change(await screen.findByLabelText('你的回答'), { target: { value: '主動介入和不介入不一樣。' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '送出回答' })) })

  expect(calls.filter(call => call.key.startsWith('POST'))).toEqual([
    { key: 'POST /solo/attempts/attempt-1/send_message', body: { text: '主動介入和不介入不一樣。' } },
  ])
})

test('first answer draft survives reload', async () => {
  const page = renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': attempt,
  })
  fireEvent.change(await screen.findByLabelText('你的回答'), { target: { value: '這是還沒送出的第一個回答草稿。' } })
  page.unmount()

  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': attempt,
  })

  expect(await screen.findByLabelText('你的回答')).toHaveValue('這是還沒送出的第一個回答草稿。')
})

test('controls follow available_actions', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': { ...attempt, available_actions: [] },
  })

  expect(await screen.findByText(/小華，先讀一讀黑板上的情境/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '送出回答' })).toBeNull()
  expect(screen.queryByLabelText('你的回答')).toBeNull()
})

test('no attempt redirects to the activity page', async () => {
  renderPage({ 'GET /solo/activities/a-1': { ...activity, attempt: null } })

  await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/learn\/activities\/a-1$/))
})

test('unknown activity shows not found with a way home', async () => {
  renderPage({ 'GET /solo/activities/a-1': () => { throw new ApiError(404, 'ACTIVITY_NOT_FOUND') } })

  expect(await screen.findByRole('heading', { name: '找不到這個活動' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '回到首頁' })).toHaveAttribute('href', '/')
})

test('activity that fails to load shows the error instead of loading forever', async () => {
  renderPage({ 'GET /solo/activities/a-1': () => { throw new ApiError(429, 'RATE_LIMITED') } })

  expect(await screen.findByRole('heading', { name: '操作太頻繁，請稍候再試。' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '回到首頁' })).toHaveAttribute('href', '/')
})

test('missing attempt shows the localized solo error', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': () => { throw new ApiError(404, 'SOLO_ATTEMPT_NOT_FOUND') },
  })

  expect(await screen.findByText('找不到這段對話。')).toBeInTheDocument()
})

test.each([
  ['LOGIN_REQUIRED', '請先登入。'],
  ['RATE_LIMITED', '操作太頻繁，請稍候再試。'],
])('solo page shows common errors for non-solo codes: %s', async (code, expectedMessage) => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': () => { throw new ApiError(400, code) },
  })

  expect(await screen.findByText(expectedMessage)).toBeInTheDocument()
})

test.each([
  ['en', 'Scenario 1'],
  ['es', 'Escenario 1'],
] as const)('%s locale renders without Chinese', async (locale, heading) => {
  await applyLocale(locale)
  const englishActivity = { ...activity, title: 'Ethics discussion', course_name: 'Philosophy' }
  const englishAttempt = {
    ...attempt, activity_title: 'Ethics discussion', course_name: 'Philosophy', display_name: 'Ana',
    scenarios: [{ ...firstScenario, text: 'A runaway trolley approaches five people.' }],
  }
  renderPage({
    'GET /solo/activities/a-1': englishActivity,
    'GET /solo/attempts/attempt-1': englishAttempt,
  }, locale)

  expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
  expect(readableText(document.body)).not.toMatch(/[\u3400-\u9fff\u3000-\u303f\u30fb\uff00-\uffef]/)
})

const dialogueAttempt = {
  ...attempt,
  state: 'in_dialogue',
  scenarios: [{ ...firstScenario, answer: '主動介入和不介入不一樣。' }],
  messages: [
    { id: 'm-1', scenario_index: 0, role: 'student', text: '主動介入和不介入不一樣。', created_at: 1 },
    { id: 'm-2', scenario_index: 0, role: 'tutor', text: '站在旁邊不行動，也是一種選擇嗎？', created_at: 2 },
  ],
  available_actions: ['send_message'],
}

test('sending shows the A1w waiting state until the reply', async () => {
  let finish: (value: unknown) => void = () => undefined
  const pending = new Promise(resolve => { finish = resolve })
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': dialogueAttempt,
    'POST /solo/attempts/attempt-1/send_message': () => pending,
  })

  const input = await screen.findByLabelText('回答蘇格拉底')
  expect(input).toHaveAttribute('maxLength', '4000')
  fireEvent.change(input, { target: { value: '我覺得沒有行動也算一種選擇。' } })
  fireEvent.click(screen.getByRole('button', { name: '送出回答' }))

  expect(screen.getByLabelText('回答蘇格拉底')).toBeDisabled()
  const timeline = screen.getByRole('region', { name: '對話紀錄' })
  const pendingBubble = within(timeline).getByText('我覺得沒有行動也算一種選擇。').closest('article')
  expect(within(pendingBubble as HTMLElement).queryByText('已保存')).toBeNull()
  expect(screen.getByRole('status')).toHaveTextContent('正在想你說的話…')
  expect(screen.getByPlaceholderText('蘇格拉底回覆後，就可以接著寫')).toBeDisabled()

  await act(async () => {
    finish({
      ...dialogueAttempt,
      messages: [
        ...dialogueAttempt.messages,
        { id: 'm-3', scenario_index: 0, role: 'student', text: '我覺得沒有行動也算一種選擇。', created_at: 3 },
        { id: 'm-4', scenario_index: 0, role: 'tutor', text: '那責任來自哪裡？', created_at: 4 },
      ],
    })
    await pending
  })
  expect(await screen.findByText('那責任來自哪裡？')).toBeInTheDocument()
})

test('the first answer shows the waiting state until the reply', async () => {
  let finish: (value: unknown) => void = () => undefined
  const pending = new Promise(resolve => { finish = resolve })
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': attempt,
    'POST /solo/attempts/attempt-1/send_message': () => pending,
  })

  fireEvent.change(await screen.findByLabelText('你的回答'), { target: { value: '我不想主動改變事情。' } })
  fireEvent.click(screen.getByRole('button', { name: '送出回答' }))

  const timeline = screen.getByRole('region', { name: '對話紀錄' })
  const pendingBubble = within(timeline).getByText('我不想主動改變事情。').closest('article')
  expect(within(pendingBubble as HTMLElement).getByText('我・第一個回答')).toBeInTheDocument()
  expect(within(pendingBubble as HTMLElement).queryByText('已保存')).toBeNull()
  expect(screen.getByRole('status')).toHaveTextContent('正在想你說的話…')

  await act(async () => {
    finish({
      ...dialogueAttempt,
      scenarios: [{ ...firstScenario, answer: '我不想主動改變事情。' }],
      messages: [
        { id: 'm-1', scenario_index: 0, role: 'student', text: '我不想主動改變事情。', created_at: 1 },
        { id: 'm-2', scenario_index: 0, role: 'tutor', text: '不改變也是一種選擇嗎？', created_at: 2 },
      ],
    })
    await pending
  })

  expect(await screen.findByText('不改變也是一種選擇嗎？')).toBeInTheDocument()
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.getByRole('region', { name: '我的回答' })).toHaveTextContent('我不想主動改變事情。')
})

test('new timeline content scrolls to the latest message', async () => {
  const scrollTo = jest.fn()
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo })
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': dialogueAttempt,
    'POST /solo/attempts/attempt-1/send_message': () => new Promise(() => undefined),
  })

  const input = await screen.findByLabelText('回答蘇格拉底')
  scrollTo.mockClear()
  fireEvent.change(input, { target: { value: '請看這則新訊息。' } })
  fireEvent.click(screen.getByRole('button', { name: '送出回答' }))

  // Instant: a smooth scroll can be dropped while the layout is still changing.
  expect(scrollTo).toHaveBeenCalledWith({ top: expect.any(Number), behavior: 'auto' })
})

test('timeline stays on the latest message when its size changes', async () => {
  const scrollTo = jest.fn()
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo })
  const callbacks: Array<() => void> = []
  const original = (globalThis as { ResizeObserver?: unknown }).ResizeObserver
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    constructor(callback: () => void) { callbacks.push(callback) }
    observe() {}
    disconnect() {}
  }
  try {
    renderPage({
      'GET /solo/activities/a-1': activity,
      'GET /solo/attempts/attempt-1': dialogueAttempt,
    })
    await screen.findByLabelText('回答蘇格拉底')
    expect(callbacks.length).toBeGreaterThan(0)
    scrollTo.mockClear()
    // The composer grew (waiting hint), so the timeline got shorter.
    act(() => callbacks.forEach(callback => callback()))
    expect(scrollTo).toHaveBeenCalledWith({ top: expect.any(Number), behavior: 'auto' })
  } finally {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = original
  }
})

test('composer draft survives reload', async () => {
  const page = renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': dialogueAttempt,
  })
  fireEvent.change(await screen.findByLabelText('回答蘇格拉底'), { target: { value: '這是還沒送出的回答草稿。' } })
  page.unmount()

  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': dialogueAttempt,
  })

  expect(await screen.findByLabelText('回答蘇格拉底')).toHaveValue('這是還沒送出的回答草稿。')
})

test('composer draft cleared after successful send', async () => {
  const sentView = {
    ...dialogueAttempt,
    messages: [
      ...dialogueAttempt.messages,
      { id: 'm-3', scenario_index: 0, role: 'student', text: '這則回答已送達。', created_at: 3 },
      { id: 'm-4', scenario_index: 0, role: 'tutor', text: '我收到了。', created_at: 4 },
    ],
  }
  const page = renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': dialogueAttempt,
    'POST /solo/attempts/attempt-1/send_message': sentView,
  })
  fireEvent.change(await screen.findByLabelText('回答蘇格拉底'), { target: { value: '這則回答已送達。' } })
  fireEvent.click(screen.getByRole('button', { name: '送出回答' }))
  expect(await screen.findByText('我收到了。')).toBeInTheDocument()
  page.unmount()

  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': dialogueAttempt,
  })

  expect(await screen.findByLabelText('回答蘇格拉底')).toHaveValue('')
})

test('timeline does not force scroll while the student reads older messages', async () => {
  const scrollTo = jest.fn()
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo })
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': dialogueAttempt,
    'POST /solo/attempts/attempt-1/send_message': () => new Promise(() => undefined),
  })

  const timeline = await screen.findByRole('region', { name: '對話紀錄' })
  Object.defineProperties(timeline, {
    scrollHeight: { configurable: true, value: 1000 },
    clientHeight: { configurable: true, value: 300 },
    scrollTop: { configurable: true, value: 100, writable: true },
  })
  fireEvent.scroll(timeline)
  scrollTo.mockClear()
  fireEvent.change(screen.getByLabelText('回答蘇格拉底'), { target: { value: '我還在看前面的內容。' } })
  fireEvent.click(screen.getByRole('button', { name: '送出回答' }))

  expect(scrollTo).not.toHaveBeenCalled()
})

test.each([
  ['429', new ApiError(429, 'RATE_LIMITED'), '操作太頻繁，請稍候再試。'],
  ['409', new ApiError(409, 'SOLO_MESSAGE_LIMIT'), '這個情境的訊息已達上限。'],
  ['network error', new ApiError(0, 'Network Error'), '操作沒有完成，請稍後再試。'],
])('failed send keeps the text in the composer: %s', async (_case, error, expectedMessage) => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': dialogueAttempt,
    'POST /solo/attempts/attempt-1/send_message': () => { throw error },
  })

  const input = await screen.findByLabelText('回答蘇格拉底')
  fireEvent.change(input, { target: { value: '這段話不可以不見。' } })
  fireEvent.click(screen.getByRole('button', { name: '送出回答' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(expectedMessage)
  expect(input).toHaveValue('這段話不可以不見。')
})

const savedTurn = {
  ...dialogueAttempt,
  state: 'awaiting_tutor',
  messages: [
    ...dialogueAttempt.messages,
    { id: 'm-3', scenario_index: 0, role: 'student', text: '我覺得沒有行動也算一種選擇。', created_at: 3 },
  ],
  available_actions: [],
}

test('only the message waiting for a reply is marked saved', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': savedTurn,
  })

  const timeline = await screen.findByRole('region', { name: '對話紀錄' })
  expect(within(timeline).getAllByText('已保存')).toHaveLength(1)
  const latest = within(timeline).getByText('我覺得沒有行動也算一種選擇。').closest('article') as HTMLElement
  expect(within(latest).getByText('已保存')).toBeInTheDocument()
})

test('after the reply no message is marked saved', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': dialogueAttempt,
  })

  const timeline = await screen.findByRole('region', { name: '對話紀錄' })
  await within(timeline).findByText('站在旁邊不行動，也是一種選擇嗎？')
  expect(within(timeline).queryByText('已保存')).toBeNull()
})

test('a send is marked saved once the server has it, before the reply', async () => {
  jest.useFakeTimers()
  let reads = 0
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': () => { reads += 1; return reads === 1 ? dialogueAttempt : savedTurn },
    'POST /solo/attempts/attempt-1/send_message': () => new Promise(() => undefined),
  })
  await act(async () => { await Promise.resolve(); await Promise.resolve() })

  fireEvent.change(screen.getByLabelText('回答蘇格拉底'), { target: { value: '我覺得沒有行動也算一種選擇。' } })
  fireEvent.click(screen.getByRole('button', { name: '送出回答' }))
  expect(screen.getByText('訊息正在送出，請稍候。')).toBeInTheDocument()

  // The student's message is committed before the provider is called, so a read shows it.
  await act(async () => { jest.advanceTimersByTime(1000); await Promise.resolve(); await Promise.resolve() })
  expect(reads).toBe(2)
  const timeline = screen.getByRole('region', { name: '對話紀錄' })
  const latest = within(timeline).getByText('我覺得沒有行動也算一種選擇。').closest('article') as HTMLElement
  expect(within(latest).getByText('已保存')).toBeInTheDocument()
  expect(screen.getByText('你的訊息已經存好了。蘇格拉底回覆後，輸入框會重新打開。')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('正在想你說的話…')
})

test('awaiting state polls until it changes', async () => {
  jest.useFakeTimers()
  let reads = 0
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': () => {
      reads += 1
      return reads === 1
        ? { ...dialogueAttempt, state: 'awaiting_tutor', available_actions: [] }
        : dialogueAttempt
    },
  })

  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  expect(reads).toBe(1)
  await act(async () => { jest.advanceTimersByTime(3000); await Promise.resolve(); await Promise.resolve() })
  expect(reads).toBe(2)
  expect(screen.getByLabelText('回答蘇格拉底')).toBeEnabled()
})

test('tutor unavailable shows the notice and retry inside the conversation (X2)', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': {
      ...savedTurn, state: 'tutor_unavailable', notice: 'tutor_unavailable', available_actions: ['retry'],
    },
  })

  const timeline = await screen.findByRole('region', { name: '對話紀錄' })
  const notice = within(timeline).getByText('蘇格拉底暫時無法回應').closest('[role="status"]') as HTMLElement
  expect(notice).toHaveTextContent('你的訊息已經保存，不會不見。可以等一下再按重試，或先離開，回來時對話會停在這裡。')
  expect(within(notice).getByRole('button', { name: '重試' })).toBeEnabled()
  const latest = within(timeline).getByText('我覺得沒有行動也算一種選擇。').closest('article') as HTMLElement
  expect(within(latest).getByText('已保存')).toBeInTheDocument()
  // The composer is a dashed placeholder until Socrates answers.
  expect(screen.queryByLabelText('回答蘇格拉底')).toBeNull()
  expect(screen.getByText('等蘇格拉底回應後，就可以繼續回答')).toBeInTheDocument()
})

test('a reply that never came offers retry in the conversation instead of thinking', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': { ...savedTurn, available_actions: ['retry'] },
  })

  const timeline = await screen.findByRole('region', { name: '對話紀錄' })
  expect(within(timeline).getByRole('button', { name: '重試' })).toBeEnabled()
  expect(within(timeline).queryByText('正在想你說的話…')).toBeNull()
})

test('a teacher without AI shows its own title in the X2 notice', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': {
      ...savedTurn, state: 'tutor_unavailable', notice: 'owner_provider_missing', available_actions: ['retry'],
    },
  })

  const timeline = await screen.findByRole('region', { name: '對話紀錄' })
  expect(within(timeline).getByText('老師尚未設定 AI 連線')).toBeInTheDocument()
  expect(within(timeline).getByRole('button', { name: '重試' })).toBeEnabled()
})

test('retry shows the waiting state', async () => {
  let finish: (value: unknown) => void = () => undefined
  const pending = new Promise(resolve => { finish = resolve })
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': {
      ...dialogueAttempt, state: 'tutor_unavailable', notice: 'tutor_unavailable', available_actions: ['retry'],
    },
    'POST /solo/attempts/attempt-1/retry': () => pending,
  })

  expect(await screen.findByText('蘇格拉底暫時無法回應')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '重試' }))
  // Retrying: the notice gives way to Socrates thinking again.
  expect(screen.queryByText('蘇格拉底暫時無法回應')).toBeNull()
  expect(screen.getByRole('status')).toHaveTextContent('正在想你說的話…')
  await act(async () => { finish(dialogueAttempt); await pending })
})

test('stale action refreshes the view', async () => {
  const calls = mockApi({
    'GET /auth/me': signedIn,
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': dialogueAttempt,
    'POST /solo/attempts/attempt-1/send_message': () => { throw new ApiError(409, 'SOLO_ACTION_UNAVAILABLE') },
  })
  render(<MemoryRouter initialEntries={['/learn/activities/a-1/dialogue']}>
    <AuthProvider><AppRoutes /></AuthProvider>
  </MemoryRouter>)

  fireEvent.change(await screen.findByLabelText('回答蘇格拉底'), { target: { value: '這是剛剛的狀態。' } })
  fireEvent.click(screen.getByRole('button', { name: '送出回答' }))

  expect(await screen.findByText('狀態已更新')).toHaveAttribute('role', 'status')
  await waitFor(() => expect(calls.filter(call => call.key === 'GET /solo/attempts/attempt-1')).toHaveLength(2))
})

test('network failure refreshes the view', async () => {
  const calls = mockApi({
    'GET /auth/me': signedIn,
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': dialogueAttempt,
    'POST /solo/attempts/attempt-1/send_message': () => { throw new ApiError(0, 'Network Error') },
  })
  render(<MemoryRouter initialEntries={['/learn/activities/a-1/dialogue']}>
    <AuthProvider><AppRoutes /></AuthProvider>
  </MemoryRouter>)

  fireEvent.change(await screen.findByLabelText('回答蘇格拉底'), { target: { value: '網路可能剛剛中斷。' } })
  fireEvent.click(screen.getByRole('button', { name: '送出回答' }))

  expect(await screen.findByText('狀態已更新')).toHaveAttribute('role', 'status')
  await waitFor(() => expect(calls.filter(call => call.key === 'GET /solo/attempts/attempt-1')).toHaveLength(2))
})

const confirmingAttempt = {
  ...dialogueAttempt,
  state: 'confirming',
  candidate_summary: {
    current_position: '不拉下拉桿',
    reason_summary: '主動介入會讓我直接承擔另一個人的死亡。',
    relevant_conditions: ['如果軌道上的人是我認識的人，我可能會改變選擇。'],
    unresolved_issue: '不行動是否也算一種選擇？',
  },
  summary_digest: 'digest-current',
  principle_hint: '義務論',
  available_actions: ['confirm_viewpoint', 'revise_viewpoint'],
}

test('confirming shows summary and both choices', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': confirmingAttempt,
  })

  const heading = await screen.findByRole('heading', { name: '我試著整理你的想法，這樣說對嗎？' })
  expect(heading).toBeInTheDocument()
  expect(heading.closest('section')!.querySelector('.solo-stance-chip')).toBeNull()
  expect(heading.closest('section')).not.toHaveTextContent('立場')
  expect(screen.getByText('主動介入會讓我直接承擔另一個人的死亡。')).toBeInTheDocument()
  expect(screen.getByText('如果軌道上的人是我認識的人，我可能會改變選擇。')).toBeInTheDocument()
  expect(screen.queryByText('不行動是否也算一種選擇？')).toBeNull()
  expect(screen.getByText('接近的想法：義務論')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '對，這就是我的想法' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '不太對，我想再說清楚' })).toBeInTheDocument()
})

test('a capped scenario says the limit was reached and is not agreed to as "my view"', async () => {
  // The backend keeps the scenario capped and saves no confirmed viewpoint, so the card must not
  // ask the student to say "this is my view"; only the action the backend offers is shown.
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': {
      ...confirmingAttempt,
      scenarios: [{ ...firstScenario, status: 'capped' }],
      available_actions: ['confirm_viewpoint'],
    },
  })

  expect(await screen.findByRole('heading', { name: '訊息已達上限，這是到目前為止的整理' })).toBeInTheDocument()
  expect(screen.getByText('蘇格拉底整理；這個情境不會標成「已確認」')).toBeInTheDocument()
  expect(screen.getByText('主動介入會讓我直接承擔另一個人的死亡。')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '好，我知道了' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: '對，這就是我的想法' })).toBeNull()
  expect(screen.queryByRole('button', { name: '不太對，我想再說清楚' })).toBeNull()
})

test('a capped scenario still posts confirm_viewpoint with the digest', async () => {
  const calls = renderPageWithCalls({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': {
      ...confirmingAttempt,
      scenarios: [{ ...firstScenario, status: 'capped' }],
      available_actions: ['confirm_viewpoint'],
    },
    'POST /solo/attempts/attempt-1/confirm_viewpoint': { ...betweenAttempt, available_actions: [] },
  })

  fireEvent.click(await screen.findByRole('button', { name: '好，我知道了' }))
  await waitFor(() => expect(calls).toContainEqual({
    key: 'POST /solo/attempts/attempt-1/confirm_viewpoint',
    body: { summary_digest: 'digest-current' },
  }))
})

test('a scenario that ended capped is not shown as confirmed in my progress', async () => {
  const capped = { ...firstConfirmed, status: 'capped', confirmed_summary: null }
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': {
      ...secondScenarioAttempt,
      scenarios: [capped, secondScenarioAttempt.scenarios[1]],
    },
  })

  const progress = await screen.findByRole('region', { name: '我的進度' })
  const rows = within(progress).getAllByRole('listitem')
  expect(rows[0]).toHaveTextContent('情境 1')
  expect(rows[0]).toHaveTextContent('尚未釐清')
  expect(rows[0]).not.toHaveTextContent('已確認')
  expect(rows[1]).toHaveTextContent('進行中')
})

test('principle note is shown with the reference disclaimer when present', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': {
      ...confirmingAttempt,
      candidate_summary: {
        ...confirmingAttempt.candidate_summary,
        principle_note: '你在意行動本身是否把人當成手段，這接近康德式的義務論。',
      },
    },
  })

  expect(await screen.findByText('你在意行動本身是否把人當成手段，這接近康德式的義務論。')).toBeInTheDocument()
  expect(screen.getByText('這只是參考，不是你的標籤。')).toBeInTheDocument()
})

test('confirming hides the follow-up of the turn that led to it', async () => {
  // Design A2: the student's last message is followed directly by the summary card. The
  // backend decided to confirm; a new question there would ask the student two things at once.
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': {
      ...confirmingAttempt,
      messages: [
        ...dialogueAttempt.messages,
        { id: 'm-3', scenario_index: 0, role: 'student', text: '不行動不算選擇。', created_at: 3 },
        { id: 'm-4', scenario_index: 0, role: 'tutor', text: '那麼「選擇」對你來說是什麼？', created_at: 4 },
      ],
    },
  })

  await screen.findByRole('heading', { name: '我試著整理你的想法，這樣說對嗎？' })
  expect(screen.getByText('站在旁邊不行動，也是一種選擇嗎？')).toBeInTheDocument()
  expect(screen.getByText('不行動不算選擇。')).toBeInTheDocument()
  expect(screen.queryByText('那麼「選擇」對你來說是什麼？')).toBeNull()
})

test('confirm sends the current digest', async () => {
  const reviewing = { ...confirmingAttempt, state: 'reviewing', available_actions: ['submit_review'] }
  const calls = mockApi({
    'GET /auth/me': signedIn,
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': confirmingAttempt,
    'POST /solo/attempts/attempt-1/confirm_viewpoint': reviewing,
  })
  render(<MemoryRouter initialEntries={['/learn/activities/a-1/dialogue']}>
    <AuthProvider><AppRoutes /></AuthProvider>
  </MemoryRouter>)

  fireEvent.click(await screen.findByRole('button', { name: '對，這就是我的想法' }))
  await waitFor(() => expect(calls).toContainEqual({
    key: 'POST /solo/attempts/attempt-1/confirm_viewpoint',
    body: { summary_digest: 'digest-current' },
  }))
})

test('revise returns to the composer', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': confirmingAttempt,
    'POST /solo/attempts/attempt-1/revise_viewpoint': dialogueAttempt,
  })

  fireEvent.click(await screen.findByRole('button', { name: '不太對，我想再說清楚' }))
  expect(await screen.findByLabelText('回答蘇格拉底')).toBeEnabled()
})

const revisingAttempt = {
  ...confirmingAttempt,
  state: 'in_dialogue',
  messages: [
    ...dialogueAttempt.messages,
    { id: 'm-3', scenario_index: 0, role: 'student', text: '不行動不算選擇。', created_at: 3 },
    { id: 'm-4', scenario_index: 0, role: 'tutor', text: '那麼「選擇」對你來說是什麼？', created_at: 4 },
  ],
  candidate_summary: null,
  summary_digest: null,
  principle_hint: null,
  revising: true,
  rejected_summary: confirmingAttempt.candidate_summary,
  available_actions: ['send_message'],
}

test('revising shows rejected summary and structured quick options (X1)', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': revisingAttempt,
  })

  const timeline = await screen.findByRole('region', { name: '對話紀錄' })
  const echo = within(timeline).getByText('你覺得這段整理不太對').closest('article') as HTMLElement
  expect(echo).not.toHaveTextContent('立場')
  expect(echo).toHaveTextContent('理由：主動介入會讓我直接承擔另一個人的死亡。')
  expect(echo).toHaveTextContent('條件：如果軌道上的人是我認識的人，我可能會改變選擇。')
  expect(within(timeline).getByText(/謝謝你說出來，是我沒抓準。是哪一部分不像你？/)).toBeInTheDocument()
  // The follow-up asked when the backend chose to confirm stays out while revising, too.
  expect(within(timeline).queryByText('那麼「選擇」對你來說是什麼？')).toBeNull()
  for (const name of ['立場不太對', '理由不太對', '條件不太對', '我其實改變想法了']) {
    expect(screen.getByRole('button', { name })).toBeInTheDocument()
  }
  expect(screen.getByText('整理不對很正常')).toBeInTheDocument()
})

test('quick option is single-select, cancellable, and sends revise_hint', async () => {
  const calls = mockApi({
    'GET /auth/me': signedIn,
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': revisingAttempt,
    'POST /solo/attempts/attempt-1/send_message': { ...revisingAttempt, revising: false, rejected_summary: null },
  })
  render(<MemoryRouter initialEntries={['/learn/activities/a-1/dialogue']}>
    <AuthProvider><AppRoutes /></AuthProvider>
  </MemoryRouter>)

  const reasonHint = await screen.findByRole('button', { name: '理由不太對' })
  fireEvent.click(reasonHint)
  const input = screen.getByLabelText('說說哪裡不對') as HTMLTextAreaElement
  expect(reasonHint).toHaveAttribute('aria-pressed', 'true')
  expect(input).toHaveValue('')
  await waitFor(() => expect(document.activeElement).toBe(input))

  fireEvent.click(reasonHint)
  expect(reasonHint).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(reasonHint)
  fireEvent.change(input, { target: { value: '我在意的是那個人是不是因為我才死的。' } })
  fireEvent.click(screen.getByRole('button', { name: '送出回答' }))

  await waitFor(() => expect(calls).toContainEqual({
    key: 'POST /solo/attempts/attempt-1/send_message',
    body: { text: '我在意的是那個人是不是因為我才死的。', revise_hint: 'reason' },
  }))
})

test('quick option leaves the cursor at the end of the composer', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': revisingAttempt,
  })

  fireEvent.click(await screen.findByRole('button', { name: '理由不太對' }, { timeout: 5000 }))
  const input = screen.getByLabelText('說說哪裡不對') as HTMLTextAreaElement
  await waitFor(() => expect(document.activeElement).toBe(input))
  expect(input.selectionStart).toBe(input.value.length)
})

test('changed mind is only a hint: no new stance to pick', async () => {
  const calls = mockApi({
    'GET /auth/me': signedIn,
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': revisingAttempt,
    'POST /solo/attempts/attempt-1/send_message': { ...revisingAttempt, revising: false, rejected_summary: null },
  })
  render(<MemoryRouter initialEntries={['/learn/activities/a-1/dialogue']}>
    <AuthProvider><AppRoutes /></AuthProvider>
  </MemoryRouter>)

  fireEvent.click(await screen.findByRole('button', { name: '我其實改變想法了' }))
  expect(screen.queryByRole('group', { name: '改成哪個立場？' })).toBeNull()

  const input = screen.getByLabelText('說說哪裡不對')
  fireEvent.change(input, { target: { value: '我發現不行動也是選擇。' } })
  expect(screen.getByRole('button', { name: '送出回答' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: '送出回答' }))
  await waitFor(() => expect(calls).toContainEqual({
    key: 'POST /solo/attempts/attempt-1/send_message',
    body: { text: '我發現不行動也是選擇。', revise_hint: 'changed_mind' },
  }))
})

test('a later revision starts with no quick option carried over', async () => {
  const sends: unknown[] = []
  const calls = mockApi({
    'GET /auth/me': signedIn,
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': revisingAttempt,
    'POST /solo/attempts/attempt-1/send_message': (body: unknown) => {
      sends.push(body)
      return sends.length === 1 ? confirmingAttempt : { ...revisingAttempt, revising: false, rejected_summary: null }
    },
    'POST /solo/attempts/attempt-1/revise_viewpoint': revisingAttempt,
  })
  render(<MemoryRouter initialEntries={['/learn/activities/a-1/dialogue']}>
    <AuthProvider><AppRoutes /></AuthProvider>
  </MemoryRouter>)

  fireEvent.click(await screen.findByRole('button', { name: '我其實改變想法了' }))
  fireEvent.change(screen.getByLabelText('說說哪裡不對'), { target: { value: '我發現不行動也是選擇。' } })
  fireEvent.click(screen.getByRole('button', { name: '送出回答' }))
  fireEvent.click(await screen.findByRole('button', { name: '不太對，我想再說清楚' }))

  const changedMind = await screen.findByRole('button', { name: '我其實改變想法了' })
  expect(changedMind).toHaveAttribute('aria-pressed', 'false')
  fireEvent.change(screen.getByLabelText('說說哪裡不對'), { target: { value: '其實是條件不對。' } })
  fireEvent.click(screen.getByRole('button', { name: '送出回答' }))
  await waitFor(() => expect(sends).toHaveLength(2))
  expect(calls.filter(call => call.key === 'POST /solo/attempts/attempt-1/send_message').map(call => call.body)).toEqual([
    { text: '我發現不行動也是選擇。', revise_hint: 'changed_mind' },
    { text: '其實是條件不對。' },
  ])
})

test('quick options only exist while revising, never for the first answer', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': attempt,
  })

  await screen.findByLabelText('你的回答')
  expect(screen.queryByRole('group', { name: '哪裡不太對？（可選一項）' })).toBeNull()
  expect(screen.queryByRole('button', { name: '我其實改變想法了' })).toBeNull()
})

test('my answer card shows the first answer once it is stored', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': dialogueAttempt,
  })

  const card = await screen.findByRole('region', { name: '我的回答' })
  expect(card).toHaveTextContent('主動介入和不介入不一樣。')
  expect(card.querySelector('[data-option]')).toBeNull()
})

test('my answer card waits for the first answer', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': attempt,
  })

  const card = await screen.findByRole('region', { name: '我的回答' })
  expect(card).toHaveTextContent('送出第一個回答後會出現在這裡。')
})

test('revising flag false hides x1 panel', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': { ...revisingAttempt, revising: false, rejected_summary: null },
  })

  const timeline = await screen.findByRole('region', { name: '對話紀錄' })
  expect(within(timeline).getByText('那麼「選擇」對你來說是什麼？')).toBeInTheDocument()
  expect(within(timeline).queryByText('你覺得這段整理不太對')).toBeNull()
  expect(screen.queryByRole('button', { name: '理由不太對' })).toBeNull()
  expect(screen.getByLabelText('回答蘇格拉底')).toBeInTheDocument()
})

const secondScenario = '同一輛電車駛向五名工人。\n你站在天橋上，身旁有一位陌生人。'
const firstConfirmed = {
  ...firstScenario, status: 'goal_met', answer: '主動介入和不介入不一樣。',
  confirmed_summary: confirmingAttempt.candidate_summary,
}
const betweenAttempt = {
  ...dialogueAttempt,
  state: 'between_scenarios',
  scenarios: [firstConfirmed],
  available_actions: ['next_scenario'],
}
const secondScenarioAttempt = {
  ...betweenAttempt,
  state: 'answering',
  scenario_index: 1,
  scenarios: [firstConfirmed, {
    index: 1, id: 's2', text: secondScenario, answer: null, status: 'in_progress', confirmed_summary: null,
  }],
  available_actions: ['send_message'],
}

test('between scenarios shows confirmed card and next button', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': betweenAttempt,
  })

  const timeline = await screen.findByRole('region', { name: '對話紀錄' })
  expect(within(timeline).getByText('情境 1 的觀點已確認')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /下一個情境/ })).toBeEnabled()
  expect(screen.queryByLabelText('回答蘇格拉底')).toBeNull()
  expect(screen.queryByLabelText('你的回答')).toBeNull()
})

test('next button absent without next_scenario action', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': { ...betweenAttempt, available_actions: [] },
  })

  await screen.findByText('情境 1 的觀點已確認')
  expect(screen.queryByRole('button', { name: /下一個情境/ })).toBeNull()
})

test('next scenario appends the new scenario verbatim and the fixed intuition prompt', async () => {
  const calls = mockApi({
    'GET /auth/me': signedIn,
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': betweenAttempt,
    'POST /solo/attempts/attempt-1/next_scenario': secondScenarioAttempt,
  })
  render(<MemoryRouter initialEntries={['/learn/activities/a-1/dialogue']}>
    <AuthProvider><AppRoutes /></AuthProvider>
  </MemoryRouter>)

  const next = await screen.findByRole('button', { name: /下一個情境/ }, { timeout: 5000 })
  await act(async () => { fireEvent.click(next) })

  expect(calls).toContainEqual({ key: 'POST /solo/attempts/attempt-1/next_scenario', body: undefined })
  const timeline = screen.getByRole('region', { name: '對話紀錄' })
  // The previous scenario stays, collapsed to its confirmed viewpoint.
  expect(within(timeline).getByText('情境 1 的觀點已確認')).toBeInTheDocument()
  expect(within(timeline).queryByText('站在旁邊不行動，也是一種選擇嗎？')).toBeNull()
  expect(within(timeline).getByText('新的情境')).toBeInTheDocument()
  const verbatim = within(timeline).getByText((_, node) => node?.tagName === 'P' && node.textContent === secondScenario)
  expect(verbatim).toBeInTheDocument()
  expect(within(timeline).getByText(/先別急著想理由，你的第一個直覺是什麼？/)).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1, name: '情境 2' })).toBeInTheDocument()
  // The new scenario is answered in the same composer, with the student's own words.
  expect(screen.getByLabelText('你的回答')).toBeEnabled()
})

test('progress lists only the scenarios reached', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': secondScenarioAttempt,
  })

  const progress = await screen.findByRole('region', { name: '我的進度' })
  const rows = within(progress).getAllByRole('listitem')
  expect(rows).toHaveLength(2)
  expect(rows[0]).toHaveTextContent('情境 1')
  expect(rows[0]).toHaveTextContent('已確認')
  expect(rows[1]).toHaveTextContent('情境 2')
  expect(rows[1]).toHaveTextContent('進行中')
  expect(progress).not.toHaveTextContent('還沒開始')
})

test('review keeps the conversation and ends it with the confirmed viewpoint', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': {
      ...confirmingAttempt,
      state: 'reviewing',
      messages: [
        ...dialogueAttempt.messages,
        { id: 'm-3', scenario_index: 0, role: 'student', text: '不行動不算選擇。', created_at: 3 },
        { id: 'm-4', scenario_index: 0, role: 'tutor', text: '那麼「選擇」對你來說是什麼？', created_at: 4 },
      ],
      scenarios: [{
        ...confirmingAttempt.scenarios[0], status: 'goal_met',
        confirmed_summary: confirmingAttempt.candidate_summary,
      }],
      candidate_summary: null,
      summary_digest: null,
      available_actions: ['submit_review'],
    },
  })

  const timeline = await screen.findByRole('region', { name: '對話紀錄' })
  expect(within(timeline).getByText('站在旁邊不行動，也是一種選擇嗎？')).toBeInTheDocument()
  expect(within(timeline).getByText('不行動不算選擇。')).toBeInTheDocument()
  // The follow-up of the confirming turn stays out, as in A2.
  expect(within(timeline).queryByText('那麼「選擇」對你來說是什麼？')).toBeNull()
  expect(within(timeline).getByText('情境 1 的觀點已確認')).toBeInTheDocument()
  expect(within(timeline).getByText('主動介入會讓我直接承擔另一個人的死亡。')).toBeInTheDocument()
  expect(within(timeline).getByText(/小華，每個情境都走完了/)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '情境都走完了' })).toBeInTheDocument()
})

const reviewAttempt = {
  ...confirmingAttempt,
  state: 'reviewing',
  scenarios: [{
    ...confirmingAttempt.scenarios[0], status: 'goal_met',
    confirmed_summary: confirmingAttempt.candidate_summary,
  }],
  candidate_summary: null,
  summary_digest: null,
  final_summary: null, final_digest: null, final_status: null, final_revised: false,
  available_actions: ['retry_reflection_prompt', 'submit_review'],
}
const finalSummary = {
  points: [{ text: '你認為主動介入和任其發生不一樣。', sources: [{ message_id: 'm-1', quote: '不行動', start: 0, end: 3 }] }],
  trajectory: [{ position: '不拉下拉桿', shift_reason: '', sources: [] }],
  final_position: '你最後選擇不拉下拉桿。',
  reasoning_style: '你常從誰造成傷害來判斷。',
  open_question: '不行動是否也算一種選擇？',
}
const reflectingAttempt = {
  ...reviewAttempt,
  state: 'reflecting',
  final_summary: finalSummary,
  final_digest: 'final-digest',
  available_actions: ['submit_reflection', 'continue_reflection'],
}

test('the review offers writing the summary or finishing, as the backend allows', async () => {
  const calls = renderPageWithCalls({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': reviewAttempt,
    'POST /solo/attempts/attempt-1/retry_reflection_prompt': reflectingAttempt,
  })

  expect(await screen.findByRole('heading', { name: '情境都走完了' })).toBeInTheDocument()
  expect(screen.queryByLabelText('回答蘇格拉底')).toBeNull()
  expect(screen.getByRole('button', { name: '先結束，不整理' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: /整理我的思路/ }))
  expect(await screen.findByRole('heading', { name: '我試著整理你整個思路，這樣說對嗎？' })).toBeInTheDocument()
  expect(calls.some(call => call.key === 'POST /solo/attempts/attempt-1/submit_review')).toBe(false)
})

test('a failed summary says so and offers trying again', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': { ...reviewAttempt, notice: 'tutor_unavailable' },
  })

  expect(await screen.findByText('這次沒能整理出你的思路')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /再試一次/ })).toBeEnabled()
})

test('while the summary is written nothing can be pressed', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': { ...reviewAttempt, state: 'awaiting_reflection_prompt', available_actions: [] },
  })

  expect(await screen.findByText('蘇格拉底正在整理你整個思路⋯')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /再試一次|整理我的思路|先結束/ })).toBeNull()
})

test('the final summary is shown and 對 sends its digest', async () => {
  const calls = renderPageWithCalls({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': reflectingAttempt,
    'POST /solo/attempts/attempt-1/submit_reflection': {
      ...reflectingAttempt, state: 'completed', final_digest: null, final_status: 'confirmed', available_actions: [],
    },
  })

  expect(await screen.findByText('你認為主動介入和任其發生不一樣。')).toBeInTheDocument()
  expect(screen.getByText('你說過：「不行動」')).toBeInTheDocument()
  expect(screen.getByText('你最後選擇不拉下拉桿。')).toBeInTheDocument()
  expect(screen.getByText('不行動是否也算一種選擇？', { selector: 'dd' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '對，這就是我的思路' }))
  await waitFor(() => expect(calls).toContainEqual({
    key: 'POST /solo/attempts/attempt-1/submit_reflection',
    body: { summary_digest: 'final-digest' },
  }))
  expect(await screen.findByText('已確認')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '回到活動' })).toHaveAttribute('href', '/learn/activities/a-1')
})

test('不太對 asks for one sentence before the summary is written again', async () => {
  const calls = renderPageWithCalls({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': reflectingAttempt,
    'POST /solo/attempts/attempt-1/continue_reflection': {
      ...reflectingAttempt, final_digest: 'final-digest-2', final_revised: true,
    },
  })

  fireEvent.click(await screen.findByRole('button', { name: '不太對' }))
  const send = screen.getByRole('button', { name: '請蘇格拉底重寫' })
  expect(send).toBeDisabled()
  expect(calls.some(call => call.key === 'POST /solo/attempts/attempt-1/continue_reflection')).toBe(false)
  fireEvent.change(screen.getByLabelText('哪裡不對？寫一句就好'), { target: { value: '  我其實有猶豫  ' } })
  fireEvent.click(send)
  await waitFor(() => expect(calls).toContainEqual({
    key: 'POST /solo/attempts/attempt-1/continue_reflection',
    body: { text: '我其實有猶豫' },
  }))
  expect(await screen.findByRole('button', { name: '對，這就是我的思路' })).toBeEnabled()
})

test('after one 不太對 the student is told the next one ends it', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': { ...reflectingAttempt, final_revised: true },
  })

  fireEvent.click(await screen.findByRole('button', { name: '不太對' }))
  expect(screen.getByText('這次之後就會結束，這份統整會標成「未確認」。')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '送出並結束' })).toBeInTheDocument()
})

test('a summary turned down twice is kept and marked 未確認', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': {
      ...reflectingAttempt, state: 'completed', final_digest: null, final_status: 'unconfirmed', available_actions: [],
    },
  })

  expect(await screen.findByText('未確認')).toBeInTheDocument()
  expect(screen.getByText('你最後選擇不拉下拉桿。')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '對，這就是我的思路' })).toBeNull()
})

test('the sentence on the final summary sits in the review, not in the scenario dialogue', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': {
      ...reflectingAttempt,
      final_revised: true,
      messages: [
        ...reflectingAttempt.messages,
        { id: 'm-fb', scenario_index: 0, role: 'student', text: '我其實有猶豫', created_at: 9, move: null, revise_hint: null, final_feedback: true },
      ],
    },
  })

  const timeline = await screen.findByRole('region', { name: '對話紀錄' })
  expect(within(timeline).queryByText('我其實有猶豫')).toBeNull()
  expect(screen.getByRole('list', { name: '你說哪裡不太對' })).toHaveTextContent('你說：「我其實有猶豫」')
})

