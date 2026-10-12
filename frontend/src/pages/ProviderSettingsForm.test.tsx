import { act, fireEvent, render, screen } from '@testing-library/react'
import { ProviderSettings } from './ProviderSettings'
import { api } from '../api/classroomClient'

jest.mock('../api/classroomClient', () => ({ api: jest.fn() }))

beforeEach(() => {
  jest.mocked(api).mockImplementation(async (path: string) =>
    path === '/provider-profiles' ? [] : { default_profile_id: null, fallback_profile_id: null, model_matrix: {}, budgets: {} })
})

test('an OpenRouter connection starts on the Free Router; other services ask for a model code', async () => {
  await act(async () => { render(<ProviderSettings />) })
  const model = screen.getByRole('combobox', { name: '預設模型' })
  expect(model).toHaveValue('openrouter/free')
  fireEvent.change(screen.getByRole('combobox', { name: /Provider|服務/ }), { target: { value: 'openai' } })
  expect(screen.getByLabelText('預設模型（自行輸入）')).toHaveValue('')
  fireEvent.change(screen.getByRole('combobox', { name: /Provider|服務/ }), { target: { value: 'openrouter' } })
  expect(screen.getByRole('combobox', { name: '預設模型' })).toHaveValue('openrouter/free')
})

test('creating a connection sends the Free Router as the model', async () => {
  await act(async () => { render(<ProviderSettings />) })
  fireEvent.change(screen.getByLabelText('連線名稱'), { target: { value: '我的 OpenRouter' } })
  fireEvent.change(screen.getByLabelText('API 金鑰'), { target: { value: 'sk-or-test' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '建立連線' })) })
  const call = jest.mocked(api).mock.calls.find(([path, method]) => path === '/provider-profiles' && method === 'POST')
  expect(call[2]).toMatchObject({ adapter: 'openrouter', default_model: 'openrouter/free', credential: 'sk-or-test' })
})

test('測試連線 shows its result inside the connection card', async () => {
  jest.mocked(api).mockImplementation(async (path: string, method?: string) => {
    if (path === '/provider-profiles') return [{ id: 'p1', name: 'OpenRouter-Free', adapter: 'openrouter', default_model: 'openrouter/free', has_credential: true, secret_last4: 'e6b0' }]
    if (path === '/provider-profiles/p1/test' && method === 'POST') return { status: 'READY', model_count: 458 }
    return { default_profile_id: null, fallback_profile_id: null, model_matrix: {}, budgets: {} }
  })
  await act(async () => { render(<ProviderSettings />) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '測試連線' })) })
  const card = screen.getByRole('heading', { name: 'OpenRouter-Free' }).closest('article')
  expect(card).toHaveTextContent('連線成功：金鑰有效，可使用 458 個模型。')
})

test('a rejected key reads as a sentence in the card', async () => {
  const { ApiError } = jest.requireActual('../api/classroomClient')
  jest.mocked(api).mockImplementation(async (path: string, method?: string) => {
    if (path === '/provider-profiles') return [{ id: 'p1', name: 'OpenRouter-Free', adapter: 'openrouter', default_model: 'openrouter/free', has_credential: true }]
    if (path === '/provider-profiles/p1/test' && method === 'POST') throw new ApiError(502, 'PROVIDER_HTTP_401')
    return { default_profile_id: null, fallback_profile_id: null, model_matrix: {}, budgets: {} }
  })
  await act(async () => { render(<ProviderSettings />) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '測試連線' })) })
  expect(screen.getByRole('heading', { name: 'OpenRouter-Free' }).closest('article')).toHaveTextContent('連線失敗：AI 服務拒絕了這組 API 金鑰，請確認金鑰是否正確。')
})
