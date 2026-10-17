import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { GroupClassroomGate, groupCapacity } from './GroupClassroom'
import { ApiError, api, getPublicConfig } from '../../api/classroomClient'
import { playRecordedDialogue } from '../avatar/recordedDialogue'
import { planSpeech } from '../avatar/speech'

jest.mock('../../api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../api/classroomClient')>('../../api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), getPublicConfig: jest.fn() }
})
// 3D 角色、分析圖與 AI 設定面板與這裡無關，jsdom 也載不了它們用到的 ESM
jest.mock('../group-analytics/GroupAnalytics', () => ({ GroupAnalytics: () => null }))
jest.mock('../classroom-stage/GroupAvatar', () => ({ GroupAvatar: () => null }))
jest.mock('../ai-settings/ClassroomAISettings', () => ({ ClassroomAISettings: () => null }))
// 保留真實 PersonalPanel → TutorAvatar → speech；只隔離 WebGL 與既有音訊播放。
jest.mock('../avatar/runtime/packPresenter.mjs', () => ({ PackPresenter: class {
  load() { return Promise.resolve() }
  setMood() {}
  stop() {}
  stopSpeech() {}
  speakTimeline(...args: unknown[]) { mockSpeakTimeline(...args) }
  alignSpeech() {}
  dispose() { return Promise.resolve() }
} }))
jest.mock('../avatar/recordedDialogue', () => ({
  ...jest.requireActual('../avatar/recordedDialogue'), playRecordedDialogue: jest.fn(),
}))
const mockSpeakTimeline = jest.fn()

type Row = { id: string; alias: string; group: number | null; actor_type: string }
const people = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: `m${i}`, alias: `學生${i}`, group: null, actor_type: i ? 'llm_student' : 'human' }))

function lobby(over: Record<string, unknown> = {}) {
  return {
    kind: 'GroupCollection', id: 'room-1', role: 'teacher', title: '倫理課', phase: 'lobby', code: 'AB12CD34',
    asset_classroom_id: null, roster: people(4), roster_digest: 'd1',
    configuration: { group_count: 1, members_per_group: 4, avatar_pack_id: 'stickman', revision: 0 },
    ai_settings: { default_profile_id: null, model_matrix: {} }, groups: [],
    available_actions: ['configure', 'start', 'add_ai_students', 'clear_ai_students'], unavailable_actions: {},
    ...over,
  }
}

type Call = [string, string?, Record<string, unknown>?]
const posts = () => (jest.mocked(api).mock.calls as Call[]).filter(([, method]) => method === 'POST')

let ids = 0
beforeEach(() => {
  ids = 0
  jest.mocked(api).mockReset()
  jest.mocked(getPublicConfig).mockReset().mockResolvedValue({ debug_mode: false })
  jest.mocked(playRecordedDialogue).mockReset()
  mockSpeakTimeline.mockClear()
  window.localStorage.clear()
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID: () => `action-${++ids}` } })
  Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: jest.fn(() => Promise.reject(new Error('offline'))) })
  window.history.replaceState({}, '', '/classrooms/room-1?mode=teacher')
})

function serve(view: () => Record<string, unknown>, handlers: Record<string, (body: Record<string, unknown>) => unknown> = {}) {
  jest.mocked(api).mockImplementation(async (url: string, method = 'GET', body?: Record<string, unknown>) => {
    if (method === 'GET' && url.startsWith('/groups/classrooms/')) return view()
    for (const [suffix, handler] of Object.entries(handlers)) if (url.endsWith(suffix)) return handler(body || {})
    return { status: 'RECORDED' }
  })
}

const Legacy = () => null

describe('教室角色與 Socratic runtime 使用相同產品資格', () => {
  const packs = [
    { id: 'ce-only', name: 'CE only', products: ['ce'], model_sha256: 'a'.repeat(64) },
    { id: 'socratic', name: 'Socratic tutor', products: ['socratic'], model_sha256: 'b'.repeat(64) },
    { id: 'shared', name: 'Shared tutor', products: ['socratic', 'ce'], model_sha256: 'c'.repeat(64) },
    { id: 'legacy', name: 'Legacy tutor', model_sha256: 'd'.repeat(64) },
    { id: 'empty', name: 'No products', products: [], model_sha256: 'e'.repeat(64) },
  ]
  function catalog() {
    jest.mocked(fetch).mockResolvedValue({
      ok: true, headers: { get: () => 'application/json' }, json: async () => ({ packs }),
    } as unknown as Response)
  }

  test.each(['socratic', 'shared', 'legacy', 'stickman'])('教師只可選可顯示的模型，並原樣保存 %s', async id => {
    catalog()
    serve(() => lobby())
    render(<GroupClassroomGate user={{}} id="room-1" Legacy={Legacy}/>)
    const picker = await screen.findByLabelText('教室角色')
    await waitFor(() => expect(within(picker).getAllByRole('option', { hidden: true }).map(option => option.getAttribute('value')))
      .toEqual(['stickman', 'socratic', 'shared', 'legacy']))
    fireEvent.change(picker, { target: { value: id } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '1. 儲存分組' })))
    expect(posts().find(([url]) => url.endsWith('/configure'))?.[2]).toMatchObject({ avatar_pack_id: id })
  })

  test.each(['ce-only', 'missing'])('舊存不適用的 %s 保留設定提示，改選仍須重新保存', async id => {
    catalog()
    serve(() => lobby({ configuration: { group_count: 1, members_per_group: 4, avatar_pack_id: id } }))
    render(<GroupClassroomGate user={{}} id="room-1" Legacy={Legacy}/>)
    const picker = await screen.findByLabelText('教室角色')
    fireEvent.click(screen.getByText('AI 學生與教室角色（選用）'))
    expect(picker).toHaveValue(id)
    expect(await screen.findByRole('alert')).toHaveTextContent(`教室角色「${id}」不適用於 Socratic 或已不在模型清單`)
    expect(picker).toHaveValue(id)
    expect(within(picker).getByRole('option', { name: `${id}（不可用，請重新選擇）`, hidden: true })).toBeDisabled()
    const start = screen.getByRole('button', { name: '2. 開始課堂 →' })
    const save = screen.getByRole('button', { name: '1. 儲存分組' })
    expect(start).toBeEnabled()
    expect(save).toBeDisabled()
    await act(async () => fireEvent.click(save))
    expect(posts().some(([url]) => url.endsWith('/configure'))).toBe(false)
    await act(async () => fireEvent.click(start))
    expect(posts().filter(([url]) => url.endsWith('/start'))).toHaveLength(1)
    expect(posts().find(([url]) => url.endsWith('/start'))?.[2]).toMatchObject({ expected_roster_digest: 'd1' })

    fireEvent.change(picker, { target: { value: 'shared' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(start).toBeDisabled()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '1. 儲存分組' })))
    expect(posts().find(([url]) => url.endsWith('/configure'))?.[2]).toMatchObject({ avatar_pack_id: 'shared' })
    expect(start).toBeEnabled()
  })

  test('catalog 失敗不阻擋 backend 授權開課或原值重新保存', async () => {
    serve(() => lobby({ configuration: { group_count: 1, members_per_group: 4, avatar_pack_id: 'saved' } }))
    render(<GroupClassroomGate user={{}} id="room-1" Legacy={Legacy}/>)
    const picker = await screen.findByLabelText('教室角色')
    fireEvent.click(screen.getByText('AI 學生與教室角色（選用）'))
    expect(await screen.findByRole('alert')).toHaveTextContent('無法確認教室角色')
    expect(picker).toHaveValue('saved')
    const start = screen.getByRole('button', { name: '2. 開始課堂 →' })
    expect(start).toBeEnabled()
    await act(async () => fireEvent.click(start))
    expect(posts().find(([url]) => url.endsWith('/start'))?.[2]).toMatchObject({ expected_roster_digest: 'd1' })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '1. 儲存分組' })))
    expect(posts().find(([url]) => url.endsWith('/configure'))?.[2]).toMatchObject({ avatar_pack_id: 'saved' })
    fireEvent.change(picker, { target: { value: 'stickman' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '1. 儲存分組' })))
    expect(posts().filter(([url]) => url.endsWith('/configure')).slice(-1)[0]?.[2]).toMatchObject({ avatar_pack_id: 'stickman' })
  })

  test.each(['saved', 'stickman'])('catalog 還在載入時，%s 不會阻擋 backend 授權的普通開課', async id => {
    jest.mocked(fetch).mockReturnValue(new Promise<Response>(() => {}))
    serve(() => lobby({ configuration: { group_count: 1, members_per_group: 4, avatar_pack_id: id } }))
    render(<GroupClassroomGate user={{}} id="room-1" Legacy={Legacy}/>)
    const start = await screen.findByRole('button', { name: '2. 開始課堂 →' })
    expect(screen.getByLabelText('教室角色')).toHaveValue(id)
    expect(start).toBeEnabled()
    await act(async () => fireEvent.click(start))
    expect(posts().find(([url]) => url.endsWith('/start'))?.[2]).toMatchObject({ expected_roster_digest: 'd1' })
  })

  test('可用人像不能越過 backend 的開課拒絕', async () => {
    catalog()
    serve(() => lobby({ available_actions: ['configure'], unavailable_actions: { start: 'LOBBY_REQUIRED' } }))
    render(<GroupClassroomGate user={{}} id="room-1" Legacy={Legacy}/>)
    const picker = await screen.findByLabelText('教室角色')
    await waitFor(() => expect(within(picker).getAllByRole('option', { hidden: true })).toHaveLength(4))
    const start = screen.getByRole('button', { name: '2. 開始課堂 →' })
    expect(start).toBeDisabled()
    expect(start).toHaveAccessibleDescription(/課堂已開始/)
    await act(async () => fireEvent.click(start))
    expect(posts().some(([url]) => url.endsWith('/start'))).toBe(false)
  })
})

test('a later action first re-sends the unconfirmed one with its original action_id, then saves the groups', async () => {
  let aiAttempts = 0
  serve(() => lobby(), {
    '/ai-students': () => {
      aiAttempts += 1
      if (aiAttempts === 1) throw new ApiError(504, 'gateway timeout')
      return { status: 'RECORDED' }
    },
  })
  render(<GroupClassroomGate user={{}} id="room-1" Legacy={Legacy} />)
  const addAI = await screen.findByRole('button', { name: '加入 AI 學生' })
  await act(async () => {
    fireEvent.click(addAI)
  })
  expect(await screen.findByText(/系統會先確認這個操作有沒有保存/)).toBeInTheDocument()

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '1. 儲存分組' }))
  })
  await waitFor(() => expect(screen.getByRole('button', { name: '2. 開始課堂 →' })).toBeEnabled())
  const sent = posts().map(([url, , body]) => [url.split('/').pop(), body?.action_id])
  expect(sent).toEqual([
    ['ai-students', 'action-1'],
    ['ai-students', 'action-1'],
    ['configure', 'action-2'],
  ])
  expect(screen.queryByText(/請重試上一個操作/)).toBeNull()
  expect(screen.queryByText(/先以原內容取得上一筆回執/)).toBeNull()
  expect(screen.queryByText(/無法開始課堂/)).toBeNull()
})

test('a still-unknown earlier action blocks the new one with a retryable note, not a dead end', async () => {
  serve(() => lobby(), { '/ai-students': () => { throw new ApiError(503, 'down') } })
  render(<GroupClassroomGate user={{}} id="room-1" Legacy={Legacy} />)
  const addAI = await screen.findByRole('button', { name: '加入 AI 學生' })
  await act(async () => {
    fireEvent.click(addAI)
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '1. 儲存分組' }))
  })
  expect(await screen.findByText(/上一個操作的結果還無法確認，請稍後再試/)).toBeInTheDocument()
  expect(posts().some(([url]) => url.endsWith('/configure'))).toBe(false)

  // 原操作被後端明確拒絕（4xx）＝沒有生效，就直接送新內容
  serve(() => lobby(), { '/ai-students': () => { throw new ApiError(409, 'LOBBY_REQUIRED') } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '1. 儲存分組' }))
  })
  await waitFor(() => expect(posts().some(([url]) => url.endsWith('/configure'))).toBe(true))
  expect(screen.getByRole('button', { name: '2. 開始課堂 →' })).toBeEnabled()
})

test('live capacity shows people vs groups × size and auto-adjusts the group count', async () => {
  serve(() => lobby({ roster: people(5) }))
  render(<GroupClassroomGate user={{}} id="room-1" Legacy={Legacy} />)
  expect(await screen.findByText('目前 5 人（含 AI）／容量 1×4＝4 人')).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('分組容量不足：還差 1 個座位')
  expect(screen.getByRole('button', { name: '1. 儲存分組' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '2. 開始課堂 →' })).toBeDisabled()
  expect(screen.getByText(/^無法開始課堂：分組容量不足/)).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '自動調整組數' }))
  expect(screen.getByLabelText('組數')).toHaveValue(2)
  expect(screen.getByText('目前 5 人（含 AI）／容量 2×4＝8 人')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByText(/^無法開始課堂：請先按「1. 儲存分組」/)).toBeInTheDocument()
})

test('the start button explains why it is disabled when nobody is seated', async () => {
  serve(() => lobby({ roster: [], available_actions: ['add_ai_students'], unavailable_actions: { configure: 'CURRENT_POPULATED_ROSTER_REQUIRED', start: 'CURRENT_POPULATED_ROSTER_REQUIRED', clear_ai_students: 'AI_STUDENTS_REQUIRED' } }))
  render(<GroupClassroomGate user={{}} id="room-1" Legacy={Legacy} />)
  const start = await screen.findByRole('button', { name: '2. 開始課堂 →' })
  expect(start).toBeDisabled()
  expect(start).toHaveAccessibleDescription(/還沒有學生入座/)
})

test('groupCapacity flags manual assignments that overfill one group', () => {
  const fit = groupCapacity(people(3), 2, 2, { m0: 1, m1: 1, m2: 1 })
  expect(fit).toMatchObject({ people: 3, capacity: 4, overfull: [2], enough: false })
  expect(groupCapacity(people(9), 1, 2, {})).toMatchObject({ neededGroups: 5, adjustable: true })
})

describe('AI student model follows the default connection’s service', () => {
  async function addWith(profile: Record<string, unknown> | null, matrixModel?: string) {
    const settings = { default_profile_id: profile ? profile.id : null, model_matrix: matrixModel ? { ai_student: matrixModel } : {} }
    jest.mocked(api).mockImplementation(async (url: string, method = 'GET') => {
      if (url === '/provider-profiles') return profile ? [profile] : []
      if (method === 'GET') return lobby({ ai_settings: settings })
      return { status: 'RECORDED' }
    })
    render(<GroupClassroomGate user={{}} id="room-1" Legacy={Legacy} />)
    const button = await screen.findByRole('button', { name: '加入 AI 學生' })
    if (profile) await waitFor(() => expect(api).toHaveBeenCalledWith('/provider-profiles'))
    await act(async () => {
      fireEvent.click(button)
    })
    return posts().find(([url]) => url.endsWith('/ai-students'))?.[2]
  }

  test('a non-OpenRouter connection never gets an OpenRouter model', async () => {
    const body = await addWith({ id: 'p-oa', adapter: 'openai', default_model: 'gpt-4o-mini' }, 'openrouter/free')
    expect(body).toMatchObject({ model: 'gpt-4o-mini', provider_profile_id: 'p-oa' })
  })

  test('a model chosen for the non-OpenRouter connection is kept', async () => {
    const body = await addWith({ id: 'p-oa', adapter: 'openai', default_model: 'gpt-4o-mini' }, 'gpt-4.1')
    expect(body).toMatchObject({ model: 'gpt-4.1' })
  })

  test('an OpenRouter connection defaults to the Free Router', async () => {
    const body = await addWith({ id: 'p-or', adapter: 'openrouter', default_model: 'anthropic/claude' })
    expect(body).toMatchObject({ model: 'openrouter/free', provider_profile_id: 'p-or' })
  })

  test('a connection with no usable model asks the teacher to pick one instead of sending', async () => {
    const body = await addWith({ id: 'p-gm', adapter: 'gemini', default_model: '' })
    expect(body).toBeUndefined()
    expect(screen.getByText(/這個 AI 連線還沒有預設模型/)).toBeInTheDocument()
  })
})

// 教師分組總覽：每組卡片的 phase 文字用共用對照表；不認得的 phase 不猜，只顯示「進行中」
test('the teacher group overview labels every group phase from the shared table', async () => {
  const group = (id: string, phase: string) => ({ id, label: `第${id}組`, phase, members: 2, acked: 0, settlement: 'OPEN', stance: null, personal_progress: null })
  serve(() => lobby({ phase: 'group_overview', groups: [
    group('1', 'viewpoint_review'), group('2', 'final_reflection'), group('3', 'preview'), group('4', 'question_summary'), group('5', 'mystery'),
  ] }))
  render(<GroupClassroomGate user={{}} id="room-1" Legacy={Legacy}/>)
  const card = async (label: string) => (await screen.findByRole('heading', { name: label })).closest('a') as HTMLElement
  expect(await card('第1組')).toHaveTextContent('確認觀點')
  expect(await card('第2組')).toHaveTextContent('最後反思')
  expect(await card('第3組')).toHaveTextContent('下一題預覽')
  expect(await card('第4組')).toHaveTextContent('本題小結')
  const unknown = await card('第5組')
  expect(unknown.querySelector('small')).toHaveTextContent(/^進行中$/)
  expect(screen.queryByText('討論進行中')).toBeNull()
})

describe('teacher controls follow the backend action contract', () => {
  test('AI 學生功能關閉時，整組 AI 控制項不出現，教室角色仍可選', async () => {
    serve(() => lobby({ available_actions: ['configure'], unavailable_actions: { start: 'CURRENT_GROUP_CONFIGURATION_REQUIRED', add_ai_students: 'AI_STUDENTS_DISABLED', clear_ai_students: 'AI_STUDENTS_DISABLED' } }))
    render(<GroupClassroomGate user={{}} id="room-1" Legacy={Legacy} />)
    expect(await screen.findByText('教室角色（選用）')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '加入 AI 學生' })).toBeNull()
    expect(screen.queryByRole('button', { name: '清除 AI 學生' })).toBeNull()
    expect(screen.getByLabelText('教室角色')).toBeInTheDocument()
  })

  test('view.features 關閉 AI 學生時，AI 控制項不出現', async () => {
    serve(() => lobby({ features: { ai_students: { enabled: false, reason: 'AI_STUDENTS_DISABLED' } }, available_actions: ['configure'], unavailable_actions: { start: 'CURRENT_GROUP_CONFIGURATION_REQUIRED', add_ai_students: 'AI_STUDENTS_DISABLED', clear_ai_students: 'AI_STUDENTS_DISABLED' } }))
    render(<GroupClassroomGate user={{}} id="room-1" Legacy={Legacy} />)
    expect(await screen.findByText('教室角色（選用）')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '補滿剩餘席位' })).toBeNull()
  })

  test('後端已確認可開始時，重新整理後不必再按一次儲存分組', async () => {
    serve(() => lobby({ available_actions: ['configure', 'start', 'add_ai_students', 'clear_ai_students'], unavailable_actions: {} }))
    render(<GroupClassroomGate user={{}} id="room-1" Legacy={Legacy} />)
    expect(await screen.findByRole('button', { name: '2. 開始課堂 →' })).toBeEnabled()
    expect(screen.queryByText(/無法開始課堂/)).toBeNull()
  })

  test('沒有 AI 學生時，清除鈕依後端停用', async () => {
    serve(() => lobby({ available_actions: ['configure', 'add_ai_students'], unavailable_actions: { start: 'CURRENT_GROUP_CONFIGURATION_REQUIRED', clear_ai_students: 'AI_STUDENTS_REQUIRED' } }))
    render(<GroupClassroomGate user={{}} id="room-1" Legacy={Legacy} />)
    expect(await screen.findByRole('button', { name: '清除 AI 學生' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '加入 AI 學生' })).toBeEnabled()
  })

  const run = (over: Record<string, unknown> = {}) => ({
    kind: 'GroupRun', id: 'run-1', role: 'teacher', phase: 'viewpoint_review', group_label: '第1組', title: '倫理課',
    members: [{ id: 'm1', alias: '甲' }, { id: 'm2', alias: '乙' }], confirmed_members: ['m1'], arguments: [], transcript: [],
    settlement: { state: 'CURRENT_PHASE_OPEN' }, available_actions: ['next', 'end'], unavailable_actions: {},
    ...over,
  })

  test('結束本組課堂要先確認，確認後送 end，並說明未確認人數', async () => {
    serve(() => run())
    render(<GroupClassroomGate user={{}} id="run-1" Legacy={Legacy} />)
    const end = await screen.findByRole('button', { name: '結束本組課堂' })
    await act(async () => { fireEvent.click(end) })
    expect(posts()).toEqual([])
    expect(screen.getByText('還有 1 位學生未確認觀點，結束後會記為未完成。')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '確定結束' })) })
    expect(posts().map(([url, , body]) => [url, body?.kind])).toEqual([['/groups/runs/run-1/commands', 'end']])
  })

  test('後端沒給的老師動作不出現', async () => {
    serve(() => run({ available_actions: [], unavailable_actions: { next: 'CURRENT_PHASE_ACTIONS' } }))
    render(<GroupClassroomGate user={{}} id="run-1" Legacy={Legacy} />)
    expect(await screen.findByText(/本組觀點與確認/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '本組：下一步' })).toBeNull()
    expect(screen.queryByRole('button', { name: '結束本組課堂' })).toBeNull()
  })
})

describe('AI 學生按鈕要立即回報結果', () => {
  const profiles = [{ id: 'p1', name: 'OR', adapter: 'openrouter', default_model: 'openrouter/free' }]
  const account = { default_profile_id: 'p1', model_matrix: { ai_student: 'openai/gpt-6-luna' } }

  test('課堂沒設 AI 連線時沿用帳號設定，加入後顯示結果與人數', async () => {
    serve(() => lobby({ roster: people(1) }), { '/provider-profiles': () => profiles, '/ai-settings/account': () => account })
    render(<GroupClassroomGate user={{}} id="room-1" Legacy={Legacy} />)
    const add = await screen.findByRole('button', { name: '加入 AI 學生' })
    await waitFor(() => expect(api).toHaveBeenCalledWith('/provider-profiles'))
    await act(async () => { fireEvent.click(add) })
    const sent = posts().find(([url]) => url.endsWith('/ai-students'))
    expect(sent?.[2]).toMatchObject({ count: 1, model: 'openai/gpt-6-luna', provider_profile_id: 'p1' })
    expect(await screen.findByText(/已加入 1 位 AI 學生/)).toBeInTheDocument()
  })

  test('加入失敗時在按鈕旁說明原因', async () => {
    serve(() => lobby({ roster: people(1) }), {
      '/provider-profiles': () => profiles,
      '/ai-settings/account': () => account,
      '/ai-students': () => { throw new ApiError(409, 'LOBBY_REQUIRED') },
    })
    render(<GroupClassroomGate user={{}} id="room-1" Legacy={Legacy} />)
    const add = await screen.findByRole('button', { name: '加入 AI 學生' })
    await waitFor(() => expect(api).toHaveBeenCalledWith('/provider-profiles'))
    await act(async () => { fireEvent.click(add) })
    expect(await screen.findByText(/加入 AI 學生沒有成功/)).toBeInTheDocument()
  })
})

test('後端沒有給 available_actions 時，老師的按鈕一律停用並說明', async () => {
  serve(() => lobby({ available_actions: undefined, unavailable_actions: undefined }))
  render(<GroupClassroomGate user={{}} id="room-1" Legacy={Legacy} />)
  expect(await screen.findByRole('button', { name: '1. 儲存分組' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '2. 開始課堂 →' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '加入 AI 學生' })).toBeDisabled()
  expect(screen.getByText(/後端未提供可用動作/)).toBeInTheDocument()
})

test.each([false, true])('分組個人對話錄音期間的新導師回覆只在錄音結束後念出（已有入場訊息：%s）', async hasEntry => {
  jest.mocked(getPublicConfig).mockResolvedValue({ debug_mode: true })
  jest.mocked(fetch).mockResolvedValue({
    ok: true, headers: { get: () => 'application/json' },
    json: async () => ({ packs: [{ id: 'socratic', name: 'Socratic tutor', products: ['socratic'], model_sha256: 'b'.repeat(64) }] }),
  } as unknown as Response)
  let finishRecording!: () => void
  jest.mocked(playRecordedDialogue).mockImplementation((_presenter, signal) => new Promise(resolve => {
    finishRecording = () => resolve({ state: 'COMPLETED' })
    signal.addEventListener('abort', () => resolve({ state: 'SUPERSEDED' }), { once: true })
  }))
  const entry = { role: 'tutor', text: '進入教室之前的問題' }
  const next = { role: 'tutor', text: '錄音期間才到達的追問' }
  const personal = {
    status: 'probing', generating: false, messages: hasEntry ? [entry] : [], completed_turns: 0, max_turns: 6,
    summary: null, summary_digest: null, baseline: null, notice: null, open: true,
  }
  serve(() => ({
    kind: 'GroupRun', id: 'run-1', role: 'student', phase: 'personal', group_label: '第1組', title: '倫理課',
    member_id: 'm1', members: [{ id: 'm1', alias: '甲' }], confirmed_members: [], arguments: [], transcript: [],
    question: { title: '情境一', scenario: '你會如何選擇？' }, personal,
    available_actions: ['personal_message'], unavailable_actions: {},
  }), {
    '/commands': () => {
      personal.messages = [...personal.messages, { role: 'student', text: '我還在思考' }, next]
      return { status: 'RECORDED' }
    },
  })
  render(<GroupClassroomGate user={{}} id="run-1" Legacy={Legacy}/>)
  await waitFor(() => expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-render-status', 'ready'))
  expect(mockSpeakTimeline).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('人像選擇（開發）'))
  fireEvent.click(screen.getByRole('button', { name: '重播既有錄音對話' }))
  expect(playRecordedDialogue).toHaveBeenCalledTimes(1)
  fireEvent.change(screen.getByLabelText('回覆導師'), { target: { value: '我還在思考' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '送出' })))
  expect(posts().find(([url]) => url.endsWith('/commands'))?.[2]).toMatchObject({
    kind: 'personal_message', data: { text: '我還在思考' },
  })
  expect(screen.getByText(next.text)).toBeInTheDocument()
  expect(screen.getByLabelText('回覆導師')).toHaveValue('')
  expect(mockSpeakTimeline).not.toHaveBeenCalled()
  await act(async () => finishRecording())
  const plan = planSpeech(next.text)
  expect(mockSpeakTimeline).toHaveBeenCalledTimes(1)
  expect(mockSpeakTimeline).toHaveBeenCalledWith(plan.events, plan.durationMs)
  fireEvent.change(screen.getByLabelText('回覆導師'), { target: { value: '尚未送出的下一則草稿' } })
  expect(mockSpeakTimeline).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText('回覆導師')).toHaveValue('尚未送出的下一則草稿')
})
