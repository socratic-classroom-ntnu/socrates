import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import {
  ApiError, applyAIConnection, getAIConnection, getAIConnectionUsage, listAIConnectionModels, setAIConnectionMode, testAIConnection,
  type AIConnectionUsageView, type AIConnectionView,
} from '../../contract/classroomClient'
import { applyLocale } from '../../i18n'
import { AIConnectionPage } from './AIConnectionPage'

jest.mock('../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../contract/classroomClient')>('../../contract/classroomClient')
  return {
    ApiError: actual.ApiError,
    getAIConnection: jest.fn(), testAIConnection: jest.fn(), applyAIConnection: jest.fn(), setAIConnectionMode: jest.fn(),
    listAIConnectionModels: jest.fn(), getAIConnectionUsage: jest.fn(),
  }
})

const get = getAIConnection as jest.Mock
const probe = testAIConnection as jest.Mock
const apply = applyAIConnection as jest.Mock
const setMode = setAIConnectionMode as jest.Mock
const models = listAIConnectionModels as jest.Mock
const usage = getAIConnectionUsage as jest.Mock

const OWN = {
  adapter: 'openrouter', model: 'google/gemini-2.5-flash', base_url: null, name: 'OpenRouter', key_last4: '7K2M', enabled: true, key_usable: true,
}
const SYSTEM_ON = { available: true, model: 'system-model' }
const SYSTEM_OFF = { available: false, model: 'system-model' }
const systemFresh: AIConnectionView = { mode: 'system', system: SYSTEM_ON, own: null }
const ownInUse: AIConnectionView = { mode: 'own', system: SYSTEM_ON, own: OWN }
const systemKept: AIConnectionView = { mode: 'system', system: SYSTEM_ON, own: { ...OWN, enabled: false } }
const NO_USAGE: AIConnectionUsageView = { status: 'none', adapter: null, used: null, limit: null, remaining: null, limit_reset: null }
const limited = (remaining: number, extra: Partial<AIConnectionUsageView> = {}): AIConnectionUsageView =>
  ({ status: 'ok', adapter: 'openrouter', used: 50 - remaining, limit: 50, remaining, limit_reset: null, ...extra })

beforeEach(async () => {
  await applyLocale('zh-Hant')
  for (const mock of [get, probe, apply, setMode, models, usage]) mock.mockReset()
  models.mockResolvedValue({ models: [
    { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google', free: false },
    { id: 'meta/llama:free', name: 'Llama', provider: 'meta', free: true },
  ] })
  usage.mockResolvedValue(NO_USAGE)
})

async function openPage(view: AIConnectionView) {
  get.mockResolvedValue(view)
  render(<AIConnectionPage />)
  await screen.findByRole('heading', { level: 1, name: 'AI 連線設定' })
}

const radio = (name: string) => screen.getByRole('radio', { name: new RegExp(`^${name}`) })
const form = () => screen.getByRole('form')

function chooseService(label: string) {
  fireEvent.click(screen.getByLabelText('服務'))
  fireEvent.click(screen.getByRole('option', { name: label }))
}

function chooseModel(id: string) {
  fireEvent.click(screen.getByLabelText('模型'))
  fireEvent.change(screen.getByRole('combobox', { name: '搜尋模型' }), { target: { value: id } })
  const typed = screen.queryByRole('option', { name: `使用「${id}」` })
  fireEvent.click(typed ?? document.querySelector(`[data-value="${CSS.escape(id)}"]`)!)
}

/** 選服務 → 貼金鑰 → 選模型 (the model list loads after the key). */
async function fillForm(key = 'sk-or-new-key') {
  chooseService('OpenRouter')
  fireEvent.change(screen.getByLabelText('貼上新的 API 金鑰'), { target: { value: key } })
  await waitFor(() => expect(models).toHaveBeenCalled(), { timeout: 2000 })
  chooseModel('google/gemini-2.5-flash')
}

// ---- 系統提供 ----------------------------------------------------------------------------------

test('a teacher who never set a key uses the system AI, with no usage block (A01)', async () => {
  await openPage(systemFresh)
  expect(radio('系統提供')).toBeChecked()
  expect(screen.getByText('system-model')).toBeInTheDocument()
  expect(screen.getByText('可直接使用')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '一個設定，全部 AI 都能用' })).toBeInTheDocument()
  expect(screen.queryByText('我的用量')).not.toBeInTheDocument()
  expect(usage).not.toHaveBeenCalled()
})

test('with the switch off and no key, the system AI is greyed out and the form shows', async () => {
  await openPage({ mode: 'system', system: SYSTEM_OFF, own: null })
  expect(radio('系統提供')).toBeDisabled()
  expect(screen.getByText('目前沒開放，請用自己的金鑰')).toBeInTheDocument()
  expect(radio('自己的金鑰')).toBeChecked()
  expect(form()).toBeInTheDocument()
  // Nobody chose the system AI before: no warning banner.
  expect(screen.queryByText('需要注意')).not.toBeInTheDocument()
})

test('the switch turned off after choosing the system AI warns and keeps the key to switch back to', async () => {
  await openPage({ ...systemKept, system: SYSTEM_OFF })
  expect(screen.getByRole('status')).toHaveTextContent('系統提供目前沒有開放，學生的對話暫時不能使用 AI。請改用自己的金鑰。')
  expect(screen.getByText('已保留的金鑰：OpenRouter・google/gemini-2.5-flash・末四碼 7K2M')).toBeInTheDocument()
  expect(radio('系統提供')).toBeChecked()
  expect(radio('系統提供')).toBeDisabled()
  setMode.mockResolvedValue(ownInUse)
  await act(async () => { fireEvent.click(radio('自己的金鑰')) })
  expect(setMode).toHaveBeenCalledWith('own')
})

// ---- 切換 --------------------------------------------------------------------------------------

test('choosing the system AI asks first with the rewritten copy (改回系統提供)', async () => {
  await openPage(ownInUse)
  fireEvent.click(radio('系統提供'))
  const dialog = screen.getByRole('dialog', { name: '改回系統提供？' })
  expect(dialog).toHaveTextContent('你的金鑰會保留。')
  expect(dialog).toHaveTextContent('學生的對話會改用系統提供的 AI，之後可以隨時切回自己的金鑰。')
  expect(setMode).not.toHaveBeenCalled()
  setMode.mockResolvedValue(systemKept)
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '確認' })) })
  expect(setMode).toHaveBeenCalledWith('system')
  expect(screen.getByText('已保留的金鑰：OpenRouter・google/gemini-2.5-flash・末四碼 7K2M')).toBeInTheDocument()
  expect(screen.queryByText('我的用量')).not.toBeInTheDocument()
})

test('cancelling keeps the own key in use', async () => {
  await openPage(ownInUse)
  fireEvent.click(radio('系統提供'))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '取消' }))
  expect(setMode).not.toHaveBeenCalled()
  expect(radio('自己的金鑰')).toBeChecked()
})

test('switching back to a kept key needs no form', async () => {
  await openPage(systemKept)
  setMode.mockResolvedValue(ownInUse)
  await act(async () => { fireEvent.click(radio('自己的金鑰')) })
  expect(setMode).toHaveBeenCalledWith('own')
  expect(screen.getByText('已連線，套用到全部 AI')).toBeInTheDocument()
  expect(screen.queryByRole('form')).not.toBeInTheDocument()
})

test('without a kept key, 自己的金鑰 only shows the form; still the system AI until applied', async () => {
  await openPage(systemFresh)
  fireEvent.click(radio('自己的金鑰'))
  expect(setMode).not.toHaveBeenCalled()
  expect(form()).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(radio('系統提供')).toBeChecked()
})

test('a refused switch says why', async () => {
  await openPage(systemKept)
  setMode.mockRejectedValue(new ApiError(409, 'AI_CONNECTION_NO_KEPT_KEY'))
  await act(async () => { fireEvent.click(radio('自己的金鑰')) })
  expect(screen.getByRole('alert')).toHaveTextContent('沒有可以使用的已保留金鑰，請重新設定連線。')
})

// ---- 已連線 ------------------------------------------------------------------------------------

test('the own key in use shows the connected card (A08)', async () => {
  await openPage(ownInUse)
  expect(radio('自己的金鑰')).toBeChecked()
  expect(screen.getByText('OpenRouter')).toBeInTheDocument()
  expect(screen.getByText('•••• •••• 7K2M')).toBeInTheDocument()
  expect(screen.getByText('已加密保存')).toBeInTheDocument()
  expect(screen.getByText('已連線，套用到全部 AI')).toBeInTheDocument()
  expect(usage).toHaveBeenCalledTimes(1)
})

test('a key that no longer works says so', async () => {
  await openPage({ ...ownInUse, own: { ...OWN, key_usable: false } })
  expect(screen.getByText('金鑰已失效，請更換金鑰')).toBeInTheDocument()
})

// ---- 設定表單 ----------------------------------------------------------------------------------

test('the form goes service → key → model, with no model picked for the teacher', async () => {
  await openPage({ mode: 'system', system: SYSTEM_OFF, own: null })
  expect(screen.getByLabelText('模型')).toBeDisabled()
  expect(screen.getByLabelText('貼上新的 API 金鑰')).toBeDisabled()
  chooseService('OpenRouter')
  expect(screen.getByRole('link', { name: '取得 OpenRouter 金鑰 ↗' })).toHaveAttribute('href', 'https://openrouter.ai/settings/keys')
  expect(screen.getByLabelText('模型')).toBeDisabled()
  fireEvent.change(screen.getByLabelText('貼上新的 API 金鑰'), { target: { value: 'sk-or-new-key' } })
  await waitFor(() => expect(screen.getByLabelText('模型')).toBeEnabled(), { timeout: 2000 })
  expect(screen.getByLabelText('模型')).toHaveTextContent('請選擇模型')
  expect(screen.getByRole('button', { name: '套用' })).toBeDisabled()
  chooseModel('google/gemini-2.5-flash')
  expect(screen.getByRole('button', { name: '套用' })).toBeEnabled()
})

test('a free model is marked as likely rate-limited', async () => {
  await openPage({ mode: 'system', system: SYSTEM_OFF, own: null })
  await fillForm()
  fireEvent.click(screen.getByLabelText('模型'))
  expect(screen.getByText('免費・可能限流')).toBeInTheDocument()
})

test('testing shows 正在連線 then 連線成功', async () => {
  await openPage({ mode: 'system', system: SYSTEM_OFF, own: null })
  await fillForm()
  let finish!: () => void
  probe.mockReturnValue(new Promise(resolve => { finish = () => resolve({ ok: true }) }))
  fireEvent.click(screen.getByRole('button', { name: '測試' }))
  expect(screen.getByRole('button', { name: '正在連線…' })).toBeDisabled()
  await act(async () => { finish() })
  expect(screen.getByRole('status')).toHaveTextContent('連線成功')
  expect(probe).toHaveBeenCalledWith({ adapter: 'openrouter', model: 'google/gemini-2.5-flash', api_key: 'sk-or-new-key' })
})

test('an invalid key marks only the key field, no banner (A11)', async () => {
  await openPage({ mode: 'system', system: SYSTEM_OFF, own: null })
  await fillForm()
  probe.mockRejectedValue(new ApiError(424, 'AI_CONNECTION_KEY_INVALID'))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '測試' })) })
  expect(screen.getByLabelText('貼上新的 API 金鑰')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByText('金鑰無效，請重新貼上後再試一次。')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '確認金鑰來源' })).toBeInTheDocument()
})

test.each([
  ['AI_CONNECTION_QUOTA', '這個服務帳號目前無可用額度。', '補充額度後再試'],
  ['AI_CONNECTION_UNREACHABLE', '暫時連不上服務，原本的連線沒有變更，請稍後再試。', '可以先繼續教學'],
  ['AI_CONNECTION_TIMEOUT', '服務太久沒有回應，原本的連線沒有變更，請稍後再試。', '可以先繼續教學'],
])('a failed apply (%s) leaves the system AI in use and says so (A10, A12)', async (code, message, card) => {
  await openPage(systemFresh)
  fireEvent.click(radio('自己的金鑰'))
  await fillForm()
  apply.mockRejectedValue(new ApiError(424, code))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '套用' })) })
  const alert = screen.getByRole('alert')
  expect(alert).toHaveTextContent(message)
  expect(alert).toHaveTextContent('尚未切換服務，目前仍使用系統提供。')
  expect(screen.getByRole('heading', { name: card })).toBeInTheDocument()
  expect(form()).toBeInTheDocument()
})

test('the first setup applies without asking', async () => {
  await openPage(systemFresh)
  fireEvent.click(radio('自己的金鑰'))
  await fillForm()
  apply.mockResolvedValue(ownInUse)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '套用' })) })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(apply).toHaveBeenCalledWith({ adapter: 'openrouter', model: 'google/gemini-2.5-flash', api_key: 'sk-or-new-key' })
  expect(screen.getByText('已連線，套用到全部 AI')).toBeInTheDocument()
})

test('replacing the key in use asks first (B01)', async () => {
  await openPage(ownInUse)
  fireEvent.click(screen.getByRole('button', { name: '更換金鑰或模型' }))
  expect(screen.getByText('目前模型設定：OpenRouter・google/gemini-2.5-flash・金鑰末四碼 7K2M')).toBeInTheDocument()
  await fillForm()
  fireEvent.click(screen.getByRole('button', { name: '套用' }))
  const dialog = screen.getByRole('dialog', { name: '確認更換金鑰或模型？' })
  expect(apply).not.toHaveBeenCalled()
  apply.mockResolvedValue(ownInUse)
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '確認' })) })
  expect(apply).toHaveBeenCalled()
})

test('a blank key keeps the saved one for the same service', async () => {
  await openPage(ownInUse)
  fireEvent.click(screen.getByRole('button', { name: '更換金鑰或模型' }))
  chooseService('OpenRouter')
  expect(screen.getByText('若只換模型，可保留原服務與已儲存的金鑰（末四碼 7K2M）。')).toBeInTheDocument()
  await waitFor(() => expect(models).toHaveBeenCalledWith({ adapter: 'openrouter' }))
})

test('only renaming asks with the advanced-settings dialog (B02)', async () => {
  await openPage(ownInUse)
  fireEvent.click(screen.getByRole('button', { name: '進階設定 ›' }))
  fireEvent.change(screen.getByLabelText('連線名稱'), { target: { value: '學校的金鑰' } })
  fireEvent.click(screen.getByRole('button', { name: '套用' }))
  const dialog = screen.getByRole('dialog', { name: '確認更改進階設定？' })
  apply.mockResolvedValue(ownInUse)
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '確認' })) })
  expect(apply).toHaveBeenCalledWith({ adapter: 'openrouter', model: 'google/gemini-2.5-flash', name: '學校的金鑰' })
})

test('a name already taken shows under the name field', async () => {
  await openPage(ownInUse)
  fireEvent.click(screen.getByRole('button', { name: '進階設定 ›' }))
  fireEvent.change(screen.getByLabelText('連線名稱'), { target: { value: '別的' } })
  apply.mockRejectedValue(new ApiError(409, 'AI_CONNECTION_NAME_TAKEN'))
  fireEvent.click(screen.getByRole('button', { name: '套用' }))
  await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '確認' })) })
  expect(screen.getByLabelText('連線名稱')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByText('已經有同名的連線。')).toBeInTheDocument()
})

test('a compatible service opens the advanced fields for its URL', async () => {
  await openPage({ mode: 'system', system: SYSTEM_OFF, own: null })
  chooseService('自訂相容服務')
  expect(screen.getByLabelText('服務網址')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /取得/ })).not.toBeInTheDocument()
})

// ---- 我的用量 ----------------------------------------------------------------------------------

async function openUsage(found: AIConnectionUsageView, own = OWN) {
  usage.mockResolvedValue(found)
  await openPage({ ...ownInUse, own })
  return screen.findByRole('region', { name: '我的用量' })
}

test('a key with a limit shows used, limit and remaining (A08)', async () => {
  const panel = await openUsage(limited(37.6, { used: 12.4, limit_reset: 'monthly' }))
  expect(panel).toHaveTextContent('OpenRouter 帳號・美元 USD・不分課程或學生')
  expect(panel).toHaveTextContent('$12.40')
  expect(panel).toHaveTextContent('$50.00')
  expect(panel).toHaveTextContent('$37.60')
  expect(panel).toHaveTextContent('每月重置')
  expect(panel).toHaveTextContent('已使用 24.8%・依 OpenRouter 金鑰上限計算')
  expect(screen.queryByText('需要注意')).not.toBeInTheDocument()
})

test('a key without a limit shows only what it used (C01)', async () => {
  const panel = await openUsage({ ...NO_USAGE, status: 'ok', adapter: 'openrouter', used: 3.5 })
  expect(panel).toHaveTextContent('$3.50')
  expect(panel).toHaveTextContent('這把金鑰未設定上限，僅顯示已用金額。')
  expect(within(panel).queryByRole('progressbar')).not.toBeInTheDocument()
})

test('less than 10% left warns at the top (C02)', async () => {
  await openUsage(limited(4))
  expect(screen.getByRole('status')).toHaveTextContent('OpenRouter 額度剩不到 10%')
})

test('nothing left shows $0.00, a full bar and the top-up link', async () => {
  const panel = await openUsage(limited(-0.37))
  expect(panel).toHaveTextContent('$0.00')
  expect(within(panel).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  const alert = screen.getByRole('alert')
  expect(alert).toHaveTextContent('這個服務帳號目前無可用額度。')
  expect(within(alert).getByRole('link', { name: '前往 OpenRouter 補充額度 ↗' })).toHaveAttribute('href', 'https://openrouter.ai/settings/credits')
})

test('another service cannot report a balance (C03)', async () => {
  const panel = await openUsage({ ...NO_USAGE, status: 'unsupported', adapter: 'openai' }, { ...OWN, adapter: 'openai', name: 'OpenAI' })
  expect(panel).toHaveTextContent('這個服務查不到餘額')
  expect(within(panel).getByRole('link', { name: '前往 OpenAI 後台查看 ↗' })).toHaveAttribute('href', 'https://platform.openai.com/usage')
})

test('a failed query offers to ask again (C04)', async () => {
  const panel = await openUsage({ ...NO_USAGE, status: 'failed', adapter: 'openrouter' })
  expect(panel).toHaveTextContent('暫時無法取得用量')
  expect(panel).toHaveTextContent('查詢逾時，不代表額度用完。你的 AI 連線設定沒有變更。')
  usage.mockResolvedValue(limited(40))
  await act(async () => { fireEvent.click(within(panel).getByRole('button', { name: '重新查詢' })) })
  expect(usage).toHaveBeenCalledTimes(2)
  expect(await screen.findByText('$40.00')).toBeInTheDocument()
})

test('the page speaks the teacher\'s language', async () => {
  await applyLocale('en')
  await openPageEn()
  expect(screen.getByRole('radio', { name: /System-provided/ })).toBeChecked()
})

async function openPageEn() {
  get.mockResolvedValue(systemFresh)
  render(<AIConnectionPage />)
  await screen.findByRole('heading', { level: 1, name: 'AI connection' })
}
