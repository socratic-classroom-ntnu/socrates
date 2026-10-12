import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GroupClassroomGate, groupCapacity } from './GroupClassroom'
import { ApiError, api } from '../api/classroomClient'

jest.mock('../api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../api/classroomClient')>('../api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn() }
})
// 3D 角色、分析圖與 AI 設定面板與這裡無關，jsdom 也載不了它們用到的 ESM
jest.mock('../features/group-analytics/GroupAnalytics', () => ({ GroupAnalytics: () => null }))
jest.mock('../features/classroom-stage/GroupAvatar', () => ({ GroupAvatar: () => null }))
jest.mock('../features/ai-settings/ClassroomAISettings', () => ({ ClassroomAISettings: () => null }))

type Row = { id: string; alias: string; group: number | null; actor_type: string }
const people = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: `m${i}`, alias: `學生${i}`, group: null, actor_type: i ? 'llm_student' : 'human' }))

function lobby(over: Record<string, unknown> = {}) {
  return {
    kind: 'GroupCollection', id: 'room-1', role: 'teacher', title: '倫理課', phase: 'lobby', code: 'AB12CD34',
    asset_classroom_id: null, roster: people(4), roster_digest: 'd1',
    configuration: { group_count: 1, members_per_group: 4, avatar_pack_id: 'stickman', revision: 0 },
    ai_settings: { default_profile_id: null, model_matrix: {} }, groups: [],
    ...over,
  }
}

type Call = [string, string?, Record<string, unknown>?]
const posts = () => (jest.mocked(api).mock.calls as Call[]).filter(([, method]) => method === 'POST')

let ids = 0
beforeEach(() => {
  ids = 0
  jest.mocked(api).mockReset()
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
  serve(() => lobby({ roster: [] }))
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
