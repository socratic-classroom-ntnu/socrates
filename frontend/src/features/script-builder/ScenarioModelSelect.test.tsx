import { act, fireEvent, render, screen } from '@testing-library/react'
import { newDocument, ScriptBuilder } from './ScriptBuilder'
import { profileModelChoices } from './ScenarioModelSelect'
import { validateDocument } from './validate'
import { ApiError, api } from '../../contract/classroomClient'

jest.mock('../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../contract/classroomClient')>('../../contract/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), exportYAML: jest.fn(), importYAML: jest.fn(), scriptAssist: jest.fn() }
})

const profiles = [
  { id: 'p1', name: '學校 OpenRouter', adapter: 'openrouter', default_model: 'openrouter/free', metadata: { model_cache: { models: [{ id: 'meta/llama' }] } } },
  { id: 'p2', name: '個人 OpenAI', adapter: 'openai', default_model: 'gpt-4o-mini', metadata: {} },
]

beforeEach(() => jest.mocked(api).mockReset())

function routes(save = jest.fn()) {
  jest.mocked(api).mockImplementation(async (path, method, body) => {
    if (path === '/provider-profiles') return profiles
    return save(path, method, body)
  })
  return save
}

test('defaults to 沿用課堂設定 and loads profiles only when the selector is used', async () => {
  const save = routes(jest.fn(async () => ({ id: 's-1', revision: 1 })))
  render(<ScriptBuilder initial={null} onSaved={jest.fn()} />)
  const select = screen.getByLabelText('情境 1 的 AI 連線')
  expect(select).toHaveValue('')
  expect(screen.getByRole('option', { name: '沿用課堂設定' })).toBeInTheDocument()
  expect(api).not.toHaveBeenCalled()

  await act(async () => { fireEvent.focus(select) })
  expect(api).toHaveBeenCalledWith('/provider-profiles')
  expect(screen.getByRole('option', { name: '個人 OpenAI（openai）' })).toBeInTheDocument()

  fireEvent.change(select, { target: { value: 'p2' } })
  expect(screen.getByLabelText('情境 1 的模型')).toHaveValue('gpt-4o-mini')

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '儲存草稿' })) })
  const [, , body] = save.mock.calls[0]
  expect(body.document.questions[0].scenario_ai).toEqual({ provider_profile_id: 'p2', model: 'gpt-4o-mini' })

  fireEvent.change(select, { target: { value: '' } })
  expect(screen.queryByLabelText('情境 1 的模型')).toBeNull()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '儲存草稿' })) })
  expect(JSON.parse(JSON.stringify(save.mock.calls[1][2])).document.questions[0]).not.toHaveProperty('scenario_ai')
  expect(api).toHaveBeenCalledTimes(3)
})

test('a saved override is shown with its profile and model', async () => {
  routes()
  const document = newDocument()
  document.questions[0] = { ...document.questions[0], scenario_ai: { provider_profile_id: 'p1', model: 'meta/llama' } } as never
  await act(async () => { render(<ScriptBuilder initial={{ id: 's-1', revision: 1, document }} onSaved={jest.fn()} />) })
  expect(screen.getByLabelText('情境 1 的 AI 連線')).toHaveValue('p1')
  expect(screen.getByLabelText('情境 1 的模型')).toHaveValue('meta/llama')
})

test('the server refusing a foreign profile reads as Chinese', async () => {
  routes(jest.fn(async () => { throw new ApiError(422, 'SCENARIO_AI_PROFILE_REQUIRED') }))
  const document = newDocument()
  document.questions[0] = { ...document.questions[0], scenario_ai: { provider_profile_id: 'gone', model: 'm' } } as never
  await act(async () => { render(<ScriptBuilder initial={{ id: 's-1', revision: 1, document }} onSaved={jest.fn()} />) })
  expect(screen.getByRole('option', { name: '已不存在的連線（請重新選擇）' })).toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '儲存草稿' })) })
  expect(screen.getByRole('status')).toHaveTextContent('有題目指定的 AI 連線已不存在或不是你建立的')
})

test('an override without a model is caught before saving', () => {
  const document = newDocument()
  document.questions[0] = { ...document.questions[0], scenario_ai: { provider_profile_id: 'p1', model: ' ' } } as never
  expect(validateDocument(document)).toEqual([{ path: 'questions.0.scenario_ai.model', message: '情境 1 的AI 模型請填寫' }])
})

test('model choices come from the chosen profile', () => {
  expect(profileModelChoices(profiles[0]).map(c => c.value)).toEqual(['openrouter/free', 'meta/llama'])
  expect(profileModelChoices(profiles[1]).map(c => c.value)).toEqual(['gpt-4o-mini'])
  expect(profileModelChoices(undefined)).toEqual([])
})
