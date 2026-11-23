import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ApiError, getSystemAI, listSystemAIModels, listToggles, saveSystemAI, testSystemAI, type ModelOption, type SystemAIView } from '../../contract/classroomClient'
import { applyLocale } from '../../i18n'
import { useAuth } from '../auth/AuthContext'
import { AdminGate } from './AdminGate'
import { AdminPage } from './AdminPage'

jest.mock('../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../contract/classroomClient')>('../../contract/classroomClient')
  return {
    ApiError: actual.ApiError,
    getSystemAI: jest.fn(), testSystemAI: jest.fn(), saveSystemAI: jest.fn(), listSystemAIModels: jest.fn(), listToggles: jest.fn(),
    updateToggle: jest.fn(), listAdmins: jest.fn(), addAdmin: jest.fn(), removeAdmin: jest.fn(),
    listFeedback: jest.fn(), feedbackScreenshot: jest.fn(),
  }
})
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }))

const get = getSystemAI as jest.Mock
const probe = testSystemAI as jest.Mock
const save = saveSystemAI as jest.Mock
const models = listSystemAIModels as jest.Mock
const LISTED: ModelOption[] = [
  { id: 'anthropic/claude-haiku-5.5', name: 'Claude Haiku 5.5', provider: 'anthropic', free: false },
  { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini', provider: 'openai', free: false },
  { id: 'meta-llama/llama-4:free', name: 'Llama 4 (free)', provider: 'meta-llama', free: true },
]
const me = { id: 'a-1', username: 'wang', kind: 'registered', verified: true, is_admin: true, account_role: 'teacher' }

const saved: SystemAIView = {
  configured: true, adapter: 'openrouter', model: 'anthropic/claude-haiku-5.5', base_url: null, key_last4: '7K2M',
  updated_at: 1_763_533_920, updated_by: { kind: 'admin', name: 'Fizzy' }, fallback_enabled: false,
}
const empty: SystemAIView = {
  configured: false, adapter: null, model: null, base_url: null, key_last4: null, updated_at: null, updated_by: null, fallback_enabled: false,
}

function renderAt(path = '/admin/system-ai') {
  return render(<MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route element={<AdminGate />}>
        <Route path="/admin" element={<AdminPage tab="toggles" />} />
        <Route path="/admin/system-ai" element={<AdminPage tab="systemAI" />} />
        <Route path="/admin/feedback" element={<AdminPage tab="feedback" />} />
        <Route path="/admin/admins" element={<AdminPage tab="admins" />} />
      </Route>
    </Routes>
  </MemoryRouter>)
}

/** A promise the test settles by hand, to put responses out of order. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

beforeEach(async () => {
  await applyLocale('zh-Hant')
  for (const mock of [get, probe, save, models]) mock.mockReset()
  models.mockResolvedValue({ models: LISTED })
  ;(useAuth as jest.Mock).mockReturnValue({ status: 'ready', account: me, refresh: jest.fn() })
  ;(listToggles as jest.Mock).mockResolvedValue([])
  get.mockResolvedValue(saved)
})

async function openForm() {
  renderAt()
  fireEvent.click(await screen.findByRole('button', { name: '更換' }))
  return screen.getByRole('form', { name: '更換系統 AI 連線' })
}

const keyField = () => screen.getByLabelText('API 金鑰')
const modelField = () => screen.getByLabelText('模型')

const SERVICE_LABELS: Record<string, string> = {
  openrouter: 'OpenRouter', openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Google Gemini', 'openai-compatible': '自訂相容服務',
}

/** Pick a service from its dropdown (the same style as the model one, spec P40). */
function chooseService(adapter: string) {
  fireEvent.click(screen.getByLabelText('服務'))
  fireEvent.click(screen.getByRole('option', { name: SERVICE_LABELS[adapter] }))
}

/** Pick a model from the dropdown: from the list when it is there, else typed in. */
function chooseModel(id: string) {
  fireEvent.click(modelField())
  fireEvent.change(screen.getByRole('combobox', { name: '搜尋模型名稱或供應商' }), { target: { value: id } })
  const typed = screen.queryByRole('option', { name: `使用「${id}」` })
  fireEvent.click(typed ?? document.querySelector(`[data-value="${CSS.escape(id)}"]`)!)
}
const saveButton = () => screen.getByRole('button', { name: '儲存' })

test('announcements follows the admins tab', async () => {
  renderAt('/admin')
  const tabs = await screen.findAllByRole('tab')
  expect(tabs.map(tab => tab.textContent)).toEqual(['功能開關', '系統 AI', '意見回饋', '管理員', '公告'])
  expect(tabs[1]).toHaveAttribute('href', '/admin/system-ai')
})

test('the saved connection shows the service, model, last four and who updated it', async () => {
  renderAt()
  expect(await screen.findByText('OpenRouter')).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '系統 AI' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText('anthropic/claude-haiku-5.5')).toBeInTheDocument()
  expect(screen.getByText('•••• •••• 7K2M')).toBeInTheDocument()
  expect(screen.getByText(/^最後由 Fizzy 在 .+ 更新$/)).toBeInTheDocument()
  expect(screen.getByText('費用直接算在這把金鑰上，系統不另外限額。請先在服務商的後台設好金額上限。')).toBeInTheDocument()
})

test('an env import reads as imported by the deploy setting', async () => {
  get.mockResolvedValue({ ...saved, updated_by: { kind: 'deploy' } })
  renderAt()
  expect(await screen.findByText(/由部署設定匯入$/)).toBeInTheDocument()
})

test('where it is used: my dialogues always, teacher courses only with the switch on', async () => {
  renderAt()
  const uses = await screen.findByRole('region', { name: '用在哪裡' })
  const rows = within(uses).getAllByRole('listitem')
  expect(within(rows[0]).getByText('使用中')).toHaveAttribute('data-on', 'true')
  expect(within(rows[1]).getByText('未使用')).toHaveAttribute('data-on', 'false')
  expect(within(rows[1]).getByRole('link', { name: '功能開關' })).toHaveAttribute('href', '/admin')
})

test('with the switch on, teacher courses say in use', async () => {
  get.mockResolvedValue({ ...saved, fallback_enabled: true })
  renderAt()
  const uses = await screen.findByRole('region', { name: '用在哪裡' })
  expect(within(within(uses).getAllByRole('listitem')[1]).getByText('使用中')).toHaveAttribute('data-on', 'true')
})

test('nothing set up yet: the warning and an empty form without cancel', async () => {
  get.mockResolvedValue(empty)
  renderAt()
  expect(await screen.findByText('還沒設定系統 AI。學生的「我的對話」現在不能用；功能開關「老師沒設金鑰時用系統 AI」打開了也沒有作用。')).toBeInTheDocument()
  const form = screen.getByRole('form', { name: '設定系統 AI 連線' })
  expect(modelField()).toHaveTextContent('選擇模型')
  expect(modelField()).toBeDisabled()
  expect(screen.getByText('貼上金鑰後就能選模型')).toBeInTheDocument()
  expect(keyField()).toHaveValue('')
  expect(within(form).queryByRole('button', { name: '取消' })).not.toBeInTheDocument()
  expect(saveButton()).toBeDisabled()
})

test('the service URL appears only for a compatible service', async () => {
  await openForm()
  expect(screen.queryByLabelText('服務網址')).not.toBeInTheDocument()
  chooseService('openai-compatible')
  expect(screen.getByLabelText('服務網址')).toBeInTheDocument()
})

test('save needs a passing test, and any change asks for a new one', async () => {
  probe.mockResolvedValue({ ok: true })
  await openForm()
  expect(screen.getByText('留空就沿用目前的金鑰（•••• 7K2M）。只換模型不用重貼。')).toBeInTheDocument()
  expect(saveButton()).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
  expect(await screen.findByText('測試成功：連得上，模型 anthropic/claude-haiku-5.5 有回應。')).toBeInTheDocument()
  expect(saveButton()).toBeEnabled()
  chooseModel('openai/gpt-5-mini')
  expect(saveButton()).toBeDisabled()
  expect(screen.queryByText(/^測試成功：/)).not.toBeInTheDocument()
})

test('a blank key is left out of the request so the saved key is kept', async () => {
  probe.mockResolvedValue({ ok: true })
  save.mockResolvedValue({ ...saved, model: 'openai/gpt-5-mini' })
  await openForm()
  chooseModel('openai/gpt-5-mini')
  fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
  await screen.findByText(/^測試成功：/)
  expect(probe).toHaveBeenCalledWith({ adapter: 'openrouter', model: 'openai/gpt-5-mini' })
  fireEvent.click(saveButton())
  await waitFor(() => expect(save).toHaveBeenCalledWith({ adapter: 'openrouter', model: 'openai/gpt-5-mini' }))
  expect(await screen.findByText('openai/gpt-5-mini')).toBeInTheDocument()
  expect(screen.queryByRole('form')).not.toBeInTheDocument()
})

test('a pasted key and a compatible URL are sent', async () => {
  probe.mockResolvedValue({ ok: true })
  await openForm()
  chooseService('openai-compatible')
  fireEvent.change(screen.getByLabelText('服務網址'), { target: { value: 'https://llm.example.com/v1' } })
  fireEvent.change(keyField(), { target: { value: ' sk-new ' } })
  fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
  await waitFor(() => expect(probe).toHaveBeenCalledWith({
    adapter: 'openai-compatible', model: 'anthropic/claude-haiku-5.5', api_key: 'sk-new', base_url: 'https://llm.example.com/v1',
  }))
})

test.each([
  ['SYSTEM_AI_KEY_INVALID', 'API 金鑰', '金鑰無效：OpenRouter 不接受這把金鑰，請確認有沒有貼完整。'],
  ['SYSTEM_AI_QUOTA', 'API 金鑰', '這把金鑰的額度用完了，請到 OpenRouter 後台加值或提高上限。'],
  ['SYSTEM_AI_MODEL_NOT_FOUND', '模型', 'OpenRouter 找不到這個模型，請檢查模型名稱。'],
  ['SYSTEM_AI_MODEL_INVALID', '模型', '模型名稱最多 200 個字元。'],
  ['SYSTEM_AI_KEY_MALFORMED', 'API 金鑰', '金鑰格式不對，請確認沒有多貼空白或引號。'],
])('%s is marked on the %s field and save stays off', async (code, field, text) => {
  probe.mockRejectedValue(new ApiError(424, code))
  await openForm()
  fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
  expect(await screen.findByText(text)).toBeInTheDocument()
  expect(screen.getByLabelText(field)).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByLabelText(field)).toHaveAccessibleDescription(expect.stringContaining(text))
  expect(saveButton()).toBeDisabled()
})

test('a bad URL is marked on the URL field', async () => {
  probe.mockRejectedValue(new ApiError(422, 'SYSTEM_AI_BASE_URL_INVALID'))
  await openForm()
  chooseService('openai-compatible')
  fireEvent.change(screen.getByLabelText('服務網址'), { target: { value: 'http://x' } })
  fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
  expect(await screen.findByText('服務網址要是 https 開頭的公開網址。')).toBeInTheDocument()
  expect(screen.getByLabelText('服務網址')).toHaveAttribute('aria-invalid', 'true')
})

test.each([
  ['SYSTEM_AI_UNREACHABLE', '連不上 OpenRouter，請稍後再試，或檢查服務網址。'],
  ['SYSTEM_AI_TIMEOUT', 'OpenRouter 太久沒有回應，請再試一次。'],
])('%s shows above the buttons', async (code, text) => {
  probe.mockRejectedValue(new ApiError(424, code))
  const form = await openForm()
  fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
  expect(await within(form).findByRole('alert')).toHaveTextContent(text)
  expect(keyField()).not.toHaveAttribute('aria-invalid')
})

test('a save refused because someone else saved keeps what was typed', async () => {
  probe.mockResolvedValue({ ok: true })
  save.mockRejectedValue(new ApiError(409, 'SYSTEM_AI_CHANGED'))
  const form = await openForm()
  chooseModel('mine')
  fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
  await screen.findByText(/^測試成功：/)
  fireEvent.click(saveButton())
  expect(await within(form).findByRole('alert')).toHaveTextContent('系統 AI 剛被更新，請重新整理後再試。')
  expect(modelField()).toHaveTextContent('mine')
})

test('a result that comes back after the form changed is ignored', async () => {
  const pending = deferred<{ ok: true }>()
  probe.mockReturnValue(pending.promise)
  await openForm()
  fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
  chooseModel('other')
  await act(async () => { pending.resolve({ ok: true }) })
  expect(screen.queryByText(/^測試成功：/)).not.toBeInTheDocument()
  expect(saveButton()).toBeDisabled()
})

test('an older test that ends after a newer failure is ignored', async () => {
  const first = deferred<{ ok: true }>()
  const second = deferred<{ ok: true }>()
  probe.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  await openForm()
  fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
  chooseModel('x')
  chooseModel('anthropic/claude-haiku-5.5')
  fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
  await act(async () => { second.reject(new ApiError(424, 'SYSTEM_AI_MODEL_NOT_FOUND')) })
  await act(async () => { first.resolve({ ok: true }) })
  expect(screen.getByText('OpenRouter 找不到這個模型，請檢查模型名稱。')).toBeInTheDocument()
  expect(saveButton()).toBeDisabled()
})

test('an older failure that ends after a newer success is ignored', async () => {
  const first = deferred<{ ok: true }>()
  const second = deferred<{ ok: true }>()
  probe.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  await openForm()
  fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
  chooseModel('x')
  chooseModel('anthropic/claude-haiku-5.5')
  fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
  await act(async () => { second.resolve({ ok: true }) })
  await act(async () => { first.reject(new ApiError(424, 'SYSTEM_AI_KEY_INVALID')) })
  expect(screen.getByText(/^測試成功：/)).toBeInTheDocument()
  expect(screen.queryByText(/金鑰無效/)).not.toBeInTheDocument()
  expect(saveButton()).toBeEnabled()
})

test('cancel goes back to the saved connection', async () => {
  await openForm()
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(screen.getByRole('button', { name: '更換' })).toBeInTheDocument()
})

test('a failed read says so', async () => {
  get.mockRejectedValue(new ApiError(500, 'boom'))
  renderAt()
  expect(await screen.findByRole('alert')).toHaveTextContent('讀不到系統 AI 設定，請重新整理頁面。')
})

test('a key error takes the place of the keep-the-key hint (AD9c)', async () => {
  probe.mockRejectedValue(new ApiError(424, 'SYSTEM_AI_KEY_INVALID'))
  await openForm()
  fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
  await screen.findByText(/^金鑰無效/)
  expect(screen.queryByText(/^留空就沿用目前的金鑰/)).not.toBeInTheDocument()
})

test('another service or URL needs the key again, so the keep-the-key hint goes away', async () => {
  await openForm()
  expect(screen.getByText(/^留空就沿用目前的金鑰/)).toBeInTheDocument()
  chooseService('anthropic')
  expect(screen.queryByText(/^留空就沿用目前的金鑰/)).not.toBeInTheDocument()
  chooseService('openrouter')
  expect(screen.getByText(/^留空就沿用目前的金鑰/)).toBeInTheDocument()
})

test('the custom service is named in the page language', async () => {
  await applyLocale('en')
  renderAt()
  fireEvent.click(await screen.findByRole('button', { name: 'Replace' }))
  fireEvent.click(screen.getByLabelText('Service'))
  expect(screen.getByRole('option', { name: 'Custom compatible service' })).toBeInTheDocument()
})

test('a compatible service keeps the key hint only at the same URL', async () => {
  get.mockResolvedValue({ ...saved, adapter: 'openai-compatible', base_url: 'https://llm.example.com/v1' })
  await openForm()
  const url = screen.getByLabelText('服務網址')
  expect(url).toHaveValue('https://llm.example.com/v1')
  expect(screen.getByText(/^留空就沿用目前的金鑰/)).toBeInTheDocument()
  fireEvent.change(url, { target: { value: 'https://elsewhere.example.com/v1' } })
  expect(screen.queryByText(/^留空就沿用目前的金鑰/)).not.toBeInTheDocument()
  fireEvent.change(url, { target: { value: ' https://llm.example.com/v1 ' } })
  expect(screen.getByText(/^留空就沿用目前的金鑰/)).toBeInTheDocument()
})


// ---- 模型下拉選單（spec P40）--------------------------------------------------------------

test('the saved connection loads the model list at once and shows names, providers and free marks', async () => {
  await openForm()
  await waitFor(() => expect(models).toHaveBeenCalledWith({ adapter: 'openrouter' }))
  expect(modelField()).toHaveTextContent('Claude Haiku 5.5')
  fireEvent.click(modelField())
  const list = screen.getByRole('listbox')
  expect(within(list).getAllByRole('option')).toHaveLength(3)
  expect(screen.getByText('全部模型 · 3 個')).toBeInTheDocument()
  const selected = within(list).getByRole('option', { selected: true })
  expect(selected).toHaveTextContent('Claude Haiku 5.5')
  expect(selected).toHaveTextContent('anthropic')
  expect(within(list).getByText('免費・可能限流')).toBeInTheDocument()
})

test('search narrows by name, id or provider', async () => {
  await openForm()
  await waitFor(() => expect(models).toHaveBeenCalled())
  fireEvent.click(modelField())
  fireEvent.change(screen.getByRole('combobox', { name: '搜尋模型名稱或供應商' }), { target: { value: 'OPENAI' } })
  const options = within(screen.getByRole('listbox')).getAllByRole('option')
  expect(options[0]).toHaveTextContent('GPT-5 Mini')
  expect(screen.getByText('符合 1 個')).toBeInTheDocument()
  expect(options.at(-1)).toHaveTextContent('使用「OPENAI」')
})

test('choosing a model asks for a new test', async () => {
  probe.mockResolvedValue({ ok: true })
  await openForm()
  await waitFor(() => expect(models).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
  await screen.findByText(/^測試成功：/)
  chooseModel('openai/gpt-5-mini')
  expect(modelField()).toHaveTextContent('GPT-5 Mini')
  expect(saveButton()).toBeDisabled()
})

test('the keyboard moves through the list, Enter picks and Escape closes', async () => {
  await openForm()
  await waitFor(() => expect(models).toHaveBeenCalled())
  fireEvent.click(modelField())
  const search = screen.getByRole('combobox', { name: '搜尋模型名稱或供應商' })
  fireEvent.keyDown(search, { key: 'Enter' }) // nothing highlighted yet: Enter keeps the list open
  expect(screen.getByRole('listbox')).toBeInTheDocument()
  fireEvent.keyDown(search, { key: 'ArrowDown' })
  fireEvent.keyDown(search, { key: 'ArrowDown' })
  fireEvent.keyDown(search, { key: 'Enter' })
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(modelField()).toHaveTextContent('GPT-5 Mini')
  fireEvent.click(modelField())
  fireEvent.keyDown(screen.getByRole('combobox', { name: '搜尋模型名稱或供應商' }), { key: 'Escape' })
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})

test('a pasted key loads the list with that key', async () => {
  get.mockResolvedValue(empty)
  renderAt()
  await screen.findByRole('form', { name: '設定系統 AI 連線' })
  expect(models).not.toHaveBeenCalled()
  fireEvent.change(keyField(), { target: { value: 'sk-pasted' } })
  await waitFor(() => expect(models).toHaveBeenCalledWith({ adapter: 'openrouter', api_key: 'sk-pasted' }))
  expect(modelField()).toBeEnabled()
})

test('another service reloads the list, and a key error from it lands on the key field', async () => {
  await openForm()
  await waitFor(() => expect(models).toHaveBeenCalledTimes(1))
  models.mockRejectedValue(new ApiError(424, 'SYSTEM_AI_KEY_INVALID'))
  chooseService('anthropic')
  fireEvent.change(keyField(), { target: { value: 'sk-ant-bad' } })
  expect(await screen.findByText('金鑰無效：Anthropic 不接受這把金鑰，請確認有沒有貼完整。')).toBeInTheDocument()
  expect(models).toHaveBeenLastCalledWith({ adapter: 'anthropic', api_key: 'sk-ant-bad' })
})

test('without a list the model can still be typed in', async () => {
  models.mockRejectedValue(new ApiError(424, 'SYSTEM_AI_UNREACHABLE'))
  await openForm()
  fireEvent.click(modelField())
  expect(await screen.findByText(/^拿不到模型清單/)).toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox', { name: '搜尋模型名稱或供應商' }), { target: { value: 'my-model' } })
  fireEvent.click(screen.getByRole('option', { name: '使用「my-model」' }))
  expect(modelField()).toHaveTextContent('my-model')
})

test('a list that arrives after the service changed is dropped', async () => {
  const late = deferred<{ models: ModelOption[] }>()
  models.mockReturnValueOnce(late.promise)
  await openForm()
  await waitFor(() => expect(models).toHaveBeenCalledTimes(1))
  models.mockResolvedValue({ models: [{ id: 'claude-x', name: 'Claude X', provider: null, free: false }] })
  chooseService('anthropic')
  fireEvent.change(keyField(), { target: { value: 'sk-ant' } })
  await waitFor(() => expect(models).toHaveBeenCalledTimes(2))
  await act(async () => { late.resolve({ models: LISTED }) })
  fireEvent.click(modelField())
  await waitFor(() => expect(within(screen.getByRole('listbox')).getAllByRole('option')[0]).toHaveTextContent('Claude X'))
  expect(screen.queryByText('Claude Haiku 5.5')).not.toBeInTheDocument()
})

test('a model list that times out says so above the buttons, without opening the dropdown', async () => {
  models.mockRejectedValue(new ApiError(424, 'SYSTEM_AI_TIMEOUT'))
  const form = await openForm()
  const alert = await within(form).findByRole('alert')
  expect(alert).toHaveTextContent('OpenRouter 太久沒有回應，請再試一次。')
  const buttons = within(form).getByRole('button', { name: '測試連線' })
  expect(alert.compareDocumentPosition(buttons) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('keys pressed while the list is loading still pick once it arrives', async () => {
  const late = deferred<{ models: ModelOption[] }>()
  models.mockReturnValueOnce(late.promise)
  await openForm()
  fireEvent.click(modelField())
  const search = screen.getByRole('combobox', { name: '搜尋模型名稱或供應商' })
  fireEvent.keyDown(search, { key: 'ArrowDown' })
  await waitFor(() => expect(models).toHaveBeenCalledTimes(1))
  await act(async () => { late.resolve({ models: LISTED }) })
  fireEvent.keyDown(search, { key: 'Enter' })
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(modelField()).not.toHaveTextContent('選擇模型')
})


test('the service dropdown matches the model one: five services, the current one checked', async () => {
  await openForm()
  const trigger = screen.getByLabelText('服務')
  expect(trigger).toHaveTextContent('OpenRouter')
  expect(trigger).toHaveAttribute('aria-haspopup', 'listbox')
  fireEvent.click(trigger)
  const options = within(screen.getByRole('listbox', { name: '服務' })).getAllByRole('option')
  expect(options.map(option => option.textContent)).toEqual(['OpenRouter', 'OpenAI', 'Anthropic', 'Google Gemini', '自訂相容服務'])
  expect(options[0]).toHaveAttribute('aria-selected', 'true')
})

test('the service dropdown works from the keyboard', async () => {
  await openForm()
  const trigger = screen.getByLabelText('服務')
  fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  const list = screen.getByRole('listbox', { name: '服務' })
  fireEvent.keyDown(list, { key: 'ArrowDown' })
  fireEvent.keyDown(list, { key: 'ArrowDown' })
  fireEvent.keyDown(list, { key: 'Enter' })
  expect(screen.queryByRole('listbox', { name: '服務' })).not.toBeInTheDocument()
  expect(trigger).toHaveTextContent('Anthropic')
  fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  fireEvent.keyDown(screen.getByRole('listbox', { name: '服務' }), { key: 'Escape' })
  expect(screen.queryByRole('listbox', { name: '服務' })).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

describe('the API key field is not a password field to the browser', () => {
  const supports = window.CSS?.supports
  afterEach(() => { if (window.CSS) window.CSS.supports = supports })

  test('where the browser can mask text, it is a masked text field with autofill off', async () => {
    Object.defineProperty(window, 'CSS', { value: { ...window.CSS, supports: (property: string) => property === '-webkit-text-security' }, configurable: true })
    await openForm()
    const key = keyField()
    expect(key).toHaveAttribute('type', 'text')
    expect(key).toHaveAttribute('autocomplete', 'off')
    expect(key).toHaveAttribute('data-masked', 'true')
    expect(key).toHaveAttribute('data-1p-ignore')
    expect(key).toHaveAttribute('data-lpignore', 'true')
  })

  test('elsewhere it stays a password field that asks not to be filled', async () => {
    Object.defineProperty(window, 'CSS', { value: { ...window.CSS, supports: () => false }, configurable: true })
    await openForm()
    expect(keyField()).toHaveAttribute('type', 'password')
    expect(keyField()).toHaveAttribute('autocomplete', 'new-password')
  })
})

test('the form itself asks the browser not to autofill', async () => {
  const form = await openForm()
  expect(form).toHaveAttribute('autocomplete', 'off')
})
