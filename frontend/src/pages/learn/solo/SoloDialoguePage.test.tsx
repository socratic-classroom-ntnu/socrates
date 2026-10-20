import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ApiError } from '../../../api/classroomClient'
import { AppRoutes } from '../../../app/routes'
import { AuthProvider } from '../../../app/AuthContext'
import { applyLocale } from '../../../i18n'
import { readableText } from '../../auth/testText'
import { mockApi, signedIn, Where } from '../../../testing/pageHarness'

jest.mock('../../../api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../../api/classroomClient')>('../../../api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})
jest.mock('../../../ClassroomApp', () => ({
  LegacyClassroomRoute: () => null,
  LegacyTeacherCourseRoute: () => null,
  LegacyTeacherRoute: () => null,
}))

const activity = {
  activity_id: 'a-1', title: '第三週倫理討論', course_id: 'c-1', course_name: '哲學導論',
  status: 'open', question_count: 1, ends_at: 1_782_317_940,
  attempt: { id: 'attempt-1', state: 'choosing_stance', question_index: 0 },
}
const scenario = '一輛失控的電車正駛向五名工人。\n你可以拉下拉桿，讓電車轉向另一條軌道。'
const attempt = {
  id: 'attempt-1', activity_id: 'a-1', activity_title: '第三週倫理討論',
  course_id: 'c-1', course_name: '哲學導論', display_name: '小華', state: 'choosing_stance',
  question_index: 0, question_count: 1,
  questions: [{
    index: 0, id: 'q-1', title: '岔道上的選擇', scenario,
    options: [{ id: 'o-a', text: '拉下拉桿' }, { id: 'o-b', text: '不拉' }],
    stance: null, status: 'in_progress', confirmed_summary: null,
  }],
  messages: [], candidate_summary: null, summary_digest: null, principle_hint: null,
  notice: null, available_actions: ['submit_stance'],
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
      questions: [{ ...attempt.questions[0], stance: { option_id: 'o-b', current_option_id: 'o-b', reason: '不能主動害人' } }],
      messages: [
        { id: 'm-1', question_index: 0, role: 'student', text: '不能主動害人', created_at: 1 },
        { id: 'm-2', question_index: 0, role: 'tutor', text: '「主動」指的是什麼？', created_at: 2 },
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
          id: 'm-hypothetical', question_index: 0, role: 'tutor',
          text: '延伸情境：如果另一條軌道上的人也已經身處危險呢？', created_at: 3,
          move: 'hypothetical', revise_hint: null,
        },
      ],
    },
  })

  const reply = await screen.findByText('延伸情境：如果另一條軌道上的人也已經身處危險呢？')
  expect(reply.closest('article')).toHaveTextContent('換個情境想想 · 不改變原題')
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

test('voice transcript fills the A0 reason without submitting', async () => {
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

  expect(screen.getByLabelText('為什麼？')).toHaveValue('我不想主動介入。')
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
    questions: [{
      ...dialogueAttempt.questions[0], title: 'El desvío', scenario: 'Un tranvía se acerca a cinco personas.',
      options: [{ id: 'o-a', text: 'Mover la palanca' }, { id: 'o-b', text: 'No moverla' }],
    }],
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

test('stances carry their letter colour: options, my choice', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': dialogueAttempt,
  })

  const choice = await screen.findByRole('region', { name: '我的選擇' })
  const chip = choice.querySelector('[data-option="B"]') as HTMLElement
  expect(chip).toHaveTextContent('B不拉')
})

test('stance buttons are tagged by letter for their colour', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': attempt,
  })

  expect(await screen.findByRole('button', { name: /拉下拉桿/ })).toHaveAttribute('data-option', 'A')
  expect(screen.getByRole('button', { name: /不拉/ })).toHaveAttribute('data-option', 'B')
})

test('A0 reason uses the same inline input pattern as A1', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': attempt,
  })

  const input = await screen.findByLabelText('為什麼？')
  const entry = input.closest('.solo-stance__entry')
  expect(entry).not.toBeNull()
  expect(within(entry as HTMLElement).getByRole('button', { name: '送出' })).toBeInTheDocument()
})

test('A0 and A1 submit buttons use the upward arrow', async () => {
  const first = renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': attempt,
  })
  const stanceSend = await screen.findByRole('button', { name: '送出' })
  expect(stanceSend.querySelector('path')).toHaveAttribute('d', 'M12 19V5M6 11l6-6 6 6')
  first.unmount()

  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': dialogueAttempt,
  })
  const replySend = await screen.findByRole('button', { name: '送出回答' })
  expect(replySend.querySelector('path')).toHaveAttribute('d', 'M12 19V5M6 11l6-6 6 6')
})

test('submit_stance posts option and reason', async () => {
  const calls = mockApi({
    'GET /auth/me': signedIn,
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': attempt,
    'POST /solo/attempts/attempt-1/submit_stance': { ...attempt, state: 'awaiting_tutor', available_actions: [] },
  })
  render(<MemoryRouter initialEntries={['/learn/activities/a-1/dialogue']}>
    <AuthProvider><AppRoutes /></AuthProvider>
  </MemoryRouter>)

  fireEvent.click(await screen.findByRole('button', { name: 'B 不拉' }))
  fireEvent.change(screen.getByLabelText('為什麼？'), { target: { value: '主動介入和不介入不一樣。' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '送出' })) })

  expect(calls).toContainEqual({
    key: 'POST /solo/attempts/attempt-1/submit_stance',
    body: { option_id: 'o-b', reason: '主動介入和不介入不一樣。' },
  })
})

test('stance draft survives reload', async () => {
  const page = renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': attempt,
  })
  fireEvent.click(await screen.findByRole('button', { name: 'B 不拉' }))
  fireEvent.change(screen.getByLabelText('為什麼？'), { target: { value: '這是還沒送出的立場草稿。' } })
  page.unmount()

  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': attempt,
  })

  expect(await screen.findByRole('button', { name: 'B 不拉' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByLabelText('為什麼？')).toHaveValue('這是還沒送出的立場草稿。')
})

test('controls follow available_actions', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': { ...attempt, available_actions: [] },
  })

  expect(await screen.findByText(/小華，先讀一讀黑板上的情境/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '送出' })).toBeNull()
  expect(screen.queryByLabelText('為什麼？')).toBeNull()
})

test('no attempt redirects to the activity page', async () => {
  renderPage({ 'GET /solo/activities/a-1': { ...activity, attempt: null } })

  await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/learn\/activities\/a-1$/))
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
  ['en', 'Question 1 · The switch'],
  ['es', 'Pregunta 1 · The switch'],
] as const)('%s locale renders without Chinese', async (locale, heading) => {
  await applyLocale(locale)
  const englishActivity = { ...activity, title: 'Ethics discussion', course_name: 'Philosophy' }
  const englishAttempt = {
    ...attempt, activity_title: 'Ethics discussion', course_name: 'Philosophy', display_name: 'Ana',
    questions: [{
      ...attempt.questions[0], title: 'The switch', scenario: 'A runaway trolley approaches five people.',
      options: [{ id: 'o-a', text: 'Pull the lever' }, { id: 'o-b', text: 'Do not pull it' }],
    }],
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
  questions: [{ ...attempt.questions[0], stance: { option_id: 'o-b', current_option_id: 'o-b', reason: '主動介入和不介入不一樣。' } }],
  messages: [
    { id: 'm-1', question_index: 0, role: 'student', text: '主動介入和不介入不一樣。', created_at: 1 },
    { id: 'm-2', question_index: 0, role: 'tutor', text: '站在旁邊不行動，也是一種選擇嗎？', created_at: 2 },
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
        { id: 'm-3', question_index: 0, role: 'student', text: '我覺得沒有行動也算一種選擇。', created_at: 3 },
        { id: 'm-4', question_index: 0, role: 'tutor', text: '那責任來自哪裡？', created_at: 4 },
      ],
    })
    await pending
  })
  expect(await screen.findByText('那責任來自哪裡？')).toBeInTheDocument()
})

test('submit stance shows the waiting state until the reply', async () => {
  let finish: (value: unknown) => void = () => undefined
  const pending = new Promise(resolve => { finish = resolve })
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': attempt,
    'POST /solo/attempts/attempt-1/submit_stance': () => pending,
  })

  fireEvent.click(await screen.findByRole('button', { name: 'B 不拉' }))
  fireEvent.change(screen.getByLabelText('為什麼？'), { target: { value: '我不想主動改變事情。' } })
  fireEvent.click(screen.getByRole('button', { name: '送出' }))

  const timeline = screen.getByRole('region', { name: '對話紀錄' })
  const pendingBubble = within(timeline).getByText('我不想主動改變事情。').closest('article')
  expect(within(pendingBubble as HTMLElement).getByText('我・第一個回答')).toBeInTheDocument()
  expect(within(pendingBubble as HTMLElement).queryByText('已保存')).toBeNull()
  expect(screen.getByRole('status')).toHaveTextContent('正在想你說的話…')

  await act(async () => {
    finish({
      ...dialogueAttempt,
      questions: [{ ...attempt.questions[0], stance: { option_id: 'o-b', current_option_id: 'o-b', reason: '我不想主動改變事情。' } }],
      messages: [
        { id: 'm-1', question_index: 0, role: 'student', text: '我不想主動改變事情。', created_at: 1 },
        { id: 'm-2', question_index: 0, role: 'tutor', text: '不改變也是一種選擇嗎？', created_at: 2 },
      ],
    })
    await pending
  })

  expect(await screen.findByText('不改變也是一種選擇嗎？')).toBeInTheDocument()
  expect(screen.queryByRole('status')).toBeNull()
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
      { id: 'm-3', question_index: 0, role: 'student', text: '這則回答已送達。', created_at: 3 },
      { id: 'm-4', question_index: 0, role: 'tutor', text: '我收到了。', created_at: 4 },
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
  ['409', new ApiError(409, 'SOLO_MESSAGE_LIMIT'), '這一題的訊息已達上限。'],
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
    { id: 'm-3', question_index: 0, role: 'student', text: '我覺得沒有行動也算一種選擇。', created_at: 3 },
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
  const chip = heading.closest('section')!.querySelector('[data-option="B"]') as HTMLElement
  expect(chip).toHaveTextContent('B不拉')
  expect(screen.getByText('主動介入會讓我直接承擔另一個人的死亡。')).toBeInTheDocument()
  expect(screen.getByText('如果軌道上的人是我認識的人，我可能會改變選擇。')).toBeInTheDocument()
  expect(screen.queryByText('不行動是否也算一種選擇？')).toBeNull()
  expect(screen.getByText('接近的想法：義務論')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '對，這就是我的想法' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '不太對，我想再說清楚' })).toBeInTheDocument()
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
        { id: 'm-3', question_index: 0, role: 'student', text: '不行動不算選擇。', created_at: 3 },
        { id: 'm-4', question_index: 0, role: 'tutor', text: '那麼「選擇」對你來說是什麼？', created_at: 4 },
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
    { id: 'm-3', question_index: 0, role: 'student', text: '不行動不算選擇。', created_at: 3 },
    { id: 'm-4', question_index: 0, role: 'tutor', text: '那麼「選擇」對你來說是什麼？', created_at: 4 },
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
  expect(echo).toHaveTextContent('立場：B 不拉')
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

test('changed mind requires a new stance and sends new_option_id', async () => {
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
  const choices = screen.getByRole('group', { name: '改成哪個立場？' })
  expect(within(choices).queryByRole('button', { name: 'B 不拉' })).toBeNull()

  const input = screen.getByLabelText('說說哪裡不對')
  fireEvent.change(input, { target: { value: '我發現不行動也是選擇。' } })
  expect(screen.getByRole('button', { name: '送出回答' })).toBeDisabled()

  fireEvent.click(within(choices).getByRole('button', { name: 'A 拉下拉桿' }))
  fireEvent.click(screen.getByRole('button', { name: '送出回答' }))
  await waitFor(() => expect(calls).toContainEqual({
    key: 'POST /solo/attempts/attempt-1/send_message',
    body: { text: '我發現不行動也是選擇。', revise_hint: 'changed_mind', new_option_id: 'o-a' },
  }))
})

test('stance card shows current option after a change', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': {
      ...dialogueAttempt,
      questions: [{
        ...dialogueAttempt.questions[0],
        stance: { ...dialogueAttempt.questions[0].stance, current_option_id: 'o-a' },
      }],
    },
  })

  const choice = await screen.findByRole('region', { name: '我的選擇' })
  expect(choice.querySelector('[data-option="A"]')).toHaveTextContent('A拉下拉桿')
  expect(choice.querySelector('[data-option="B"]')).toBeNull()
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
  ...attempt.questions[0], status: 'goal_met', stance: { option_id: 'o-b', current_option_id: 'o-b', reason: '主動介入和不介入不一樣。' },
  confirmed_summary: confirmingAttempt.candidate_summary,
}
const betweenAttempt = {
  ...dialogueAttempt,
  state: 'between_questions',
  question_count: 2,
  questions: [firstConfirmed],
  available_actions: ['next_question'],
}
const secondQuestion = {
  ...betweenAttempt,
  state: 'choosing_stance',
  question_index: 1,
  questions: [firstConfirmed, {
    index: 1, id: 'q-2', title: '天橋上的陌生人', scenario: secondScenario,
    options: [{ id: 'p-a', text: '推他下去' }, { id: 'p-b', text: '不推' }],
    stance: null, status: 'in_progress', confirmed_summary: null,
  }],
  available_actions: ['submit_stance'],
}

test('between questions shows confirmed card and next button', async () => {
  renderPage({
    'GET /solo/activities/a-1': { ...activity, question_count: 2 },
    'GET /solo/attempts/attempt-1': betweenAttempt,
  })

  const timeline = await screen.findByRole('region', { name: '對話紀錄' })
  expect(within(timeline).getByText('題目 1 的觀點已確認 · B 不拉')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /下一題/ })).toBeEnabled()
  expect(screen.queryByLabelText('回答蘇格拉底')).toBeNull()
})

test('next button absent without next_question action', async () => {
  renderPage({
    'GET /solo/activities/a-1': { ...activity, question_count: 2 },
    'GET /solo/attempts/attempt-1': { ...betweenAttempt, available_actions: [] },
  })

  await screen.findByText('題目 1 的觀點已確認 · B 不拉')
  expect(screen.queryByRole('button', { name: /下一題/ })).toBeNull()
})

test('next question appends the new scenario and fixed intuition prompt', async () => {
  const calls = mockApi({
    'GET /auth/me': signedIn,
    'GET /solo/activities/a-1': { ...activity, question_count: 2 },
    'GET /solo/attempts/attempt-1': betweenAttempt,
    'POST /solo/attempts/attempt-1/next_question': secondQuestion,
  })
  render(<MemoryRouter initialEntries={['/learn/activities/a-1/dialogue']}>
    <AuthProvider><AppRoutes /></AuthProvider>
  </MemoryRouter>)

  const next = await screen.findByRole('button', { name: /下一題/ }, { timeout: 5000 })
  await act(async () => { fireEvent.click(next) })

  expect(calls).toContainEqual({ key: 'POST /solo/attempts/attempt-1/next_question', body: undefined })
  const timeline = screen.getByRole('region', { name: '對話紀錄' })
  // The previous question stays, collapsed to its confirmed viewpoint.
  expect(within(timeline).getByText('題目 1 的觀點已確認 · B 不拉')).toBeInTheDocument()
  expect(within(timeline).queryByText('站在旁邊不行動，也是一種選擇嗎？')).toBeNull()
  expect(within(timeline).getByText('老師設定的情境')).toBeInTheDocument()
  const verbatim = within(timeline).getByText((_, node) => node?.tagName === 'P' && node.textContent === secondScenario)
  expect(verbatim).toBeInTheDocument()
  expect(within(timeline).getByText(/先別急著想理由，你的第一個直覺是什麼？/)).toBeInTheDocument()
  expect(screen.getByText('題目 2／2')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /推他下去/ })).toBeInTheDocument()
})

test('progress lists confirmed answers and hides unreached titles', async () => {
  renderPage({
    'GET /solo/activities/a-1': { ...activity, question_count: 3 },
    'GET /solo/attempts/attempt-1': { ...secondQuestion, question_count: 3 },
  })

  const progress = await screen.findByRole('region', { name: '我的進度' })
  expect(progress).toHaveTextContent('題目 1 · 岔道上的選擇')
  expect(progress).toHaveTextContent('已確認 · B 不拉')
  expect(progress).toHaveTextContent('題目 2 · 天橋上的陌生人')
  expect(progress).toHaveTextContent('進行中')
  expect(progress).toHaveTextContent('題目 3')
  expect(progress).toHaveTextContent('還沒開始')
})

test('review keeps the conversation and ends it with the confirmed viewpoint (A3b)', async () => {
  renderPage({
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': {
      ...confirmingAttempt,
      state: 'reviewing',
      messages: [
        ...dialogueAttempt.messages,
        { id: 'm-3', question_index: 0, role: 'student', text: '不行動不算選擇。', created_at: 3 },
        { id: 'm-4', question_index: 0, role: 'tutor', text: '那麼「選擇」對你來說是什麼？', created_at: 4 },
      ],
      questions: [{
        ...confirmingAttempt.questions[0], status: 'goal_met',
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
  expect(within(timeline).getByText('題目 1 的觀點已確認 · B 不拉')).toBeInTheDocument()
  expect(within(timeline).getByText('主動介入會讓我直接承擔另一個人的死亡。')).toBeInTheDocument()
  expect(within(timeline).getByText(/小華，你已經把每一題的想法說清楚了/)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '題目都確認了' })).toBeInTheDocument()
})

test('review state shows the placeholder without submit', async () => {
  const reviewAttempt = {
    ...confirmingAttempt,
    state: 'reviewing',
    questions: [{
      ...confirmingAttempt.questions[0], status: 'goal_met',
      confirmed_summary: confirmingAttempt.candidate_summary,
    }],
    candidate_summary: null,
    summary_digest: null,
    available_actions: ['submit_review'],
  }
  const calls = mockApi({
    'GET /auth/me': signedIn,
    'GET /solo/activities/a-1': activity,
    'GET /solo/attempts/attempt-1': reviewAttempt,
  })
  render(<MemoryRouter initialEntries={['/learn/activities/a-1/dialogue']}>
    <AuthProvider><AppRoutes /></AuthProvider>
  </MemoryRouter>)

  expect(await screen.findByRole('heading', { name: '題目都確認了' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '開始回顧' })).toBeDisabled()
  expect(screen.getByText('觀點回顧開發中')).toBeInTheDocument()
  expect(screen.queryByLabelText('回答蘇格拉底')).toBeNull()
  expect(calls.some(call => call.key === 'POST /solo/attempts/attempt-1/submit_review')).toBe(false)
})
