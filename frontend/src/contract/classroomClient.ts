import axios from 'axios'
import type { components, paths } from './classroomTypes'
import { errorText } from './errorText'
import { reportSessionLost } from './sessionEvents'

// The adapter retains the established fetch(url, init) boundary used by resident tests.
function fetchAdapter(credentials: RequestCredentials) {
  return async config => {
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(
      axios.AxiosHeaders.from(config.headers).toJSON(),
    )) {
      if (value !== undefined && value !== null) {
        headers[key] = String(value)
      }
    }
    const init: RequestInit = {
      method: (config.method || 'get').toUpperCase(),
      headers,
      credentials,
    }
    if (config.data !== undefined && config.data !== null) init.body = config.data
    if (config.signal) init.signal = config.signal

    const response = await fetch(axios.getUri(config), init)
    const contentType = response.headers?.get?.('content-type') || ''
    // 成功而且沒有 body（DELETE 的 204）：回傳 null，不當成格式錯誤
    if (response.ok && (response.status === 204 || response.headers?.get?.('content-length') === '0')) {
      return { data: null, status: response.status, statusText: response.statusText || '', headers: { 'content-type': contentType }, config, request: null }
    }
    let data = null
    if (config.responseType === 'text' && typeof response.text === 'function') {
      data = await response.text()
    } else if (contentType.includes('application/json')) {
      data = await response.json()
    } else {
      const preview = typeof response.text === 'function' ? await response.text() : ''
      data = {
        detail:
          response.status >= 500
            ? `服務正在恢復（HTTP ${response.status}），請稍後重試。`
            : `服務回應格式需要更新（HTTP ${response.status}）。`,
        content_type: contentType,
        preview: preview.slice(0, 120),
      }
    }

    const result = {
      data,
      status: response.status,
      statusText: response.statusText || '',
      headers: { 'content-type': contentType },
      config,
      request: null,
    }
    if (!response.ok) {
      throw new axios.AxiosError(
        'Request failed with status code ' + response.status,
        response.status >= 500
          ? axios.AxiosError.ERR_BAD_RESPONSE
          : axios.AxiosError.ERR_BAD_REQUEST,
        config,
        null,
        result,
      )
    }
    if (
      config.responseType !== 'text' &&
      !contentType.includes('application/json')
    ) {
      throw new axios.AxiosError(
        'API route returned a non-JSON response',
        axios.AxiosError.ERR_BAD_RESPONSE,
        config,
        null,
        result,
      )
    }
    return result
  }
}

let csrf = ''

export function setCSRF(value) {
  csrf = value || ''
}

export class ApiError extends Error {
  status: number
  detail: unknown

  constructor(status: number, detail: unknown) {
    super(errorText(detail, status))
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

export const http = axios.create({
  baseURL: '/api/v2',
  adapter: fetchAdapter('same-origin'),
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.request.use(config => {
  const method = (config.method || 'get').toLowerCase()
  if (!['get', 'head', 'options'].includes(method) && csrf) {
    config.headers['X-CSRF-Token'] = csrf
  }
  return config
})

// 開發控制台用：最近的 API 錯誤，只存在這個分頁的記憶體裡（重新整理就清空，不送去任何地方）。
export type ApiErrorRecord = { at: number; method: string; path: string; status: number; code: string }
export const RECENT_API_ERROR_LIMIT = 20
let recentErrors: readonly ApiErrorRecord[] = []
const errorListeners = new Set<() => void>()

/** 最新的在前，最多 RECENT_API_ERROR_LIMIT 筆。 */
export function recentApiErrors(): readonly ApiErrorRecord[] {
  return recentErrors
}

export function subscribeApiErrors(listener: () => void): () => void {
  errorListeners.add(listener)
  return () => { errorListeners.delete(listener) }
}

/** detail 的代碼：字串原樣（截斷）、物件取 code、422 欄位錯誤列出各項 type。 */
function errorCode(detail: unknown): string {
  if (typeof detail === 'string') return detail.trim().slice(0, 160)
  if (Array.isArray(detail)) {
    const types = detail.map(item => (item && typeof item === 'object' && typeof item.type === 'string' ? item.type : '')).filter(Boolean)
    return types.length ? [...new Set(types)].join(', ') : `${detail.length} 項欄位錯誤`
  }
  if (detail && typeof detail === 'object' && typeof (detail as { code?: unknown }).code === 'string') return (detail as { code: string }).code
  return ''
}

export function recordApiError(error: ApiError, request: { method?: string; path?: string } = {}) {
  const entry = {
    at: Date.now(),
    method: (request.method || '').toUpperCase(),
    path: request.path || '',
    status: error.status,
    code: errorCode(error.detail),
  }
  recentErrors = [entry, ...recentErrors].slice(0, RECENT_API_ERROR_LIMIT)
  errorListeners.forEach(listener => listener())
}

function requestPath(config): string {
  if (!config) return ''
  try { return axios.getUri(config) } catch { return String(config.url || '') }
}

http.interceptors.response.use(
  response => response,
  error => {
    const status = error.response?.status || 0
    const detail =
      error.response?.data?.detail ??
      error.response?.data ??
      error.message
    const failure = new ApiError(status, detail)
    const path = requestPath(error.config)
    recordApiError(failure, { method: error.config?.method, path })
    reportSessionLost(detail, path)
    return Promise.reject(failure)
  },
)

export async function api(path: string, method = 'GET', body?: { signal?: AbortSignal } & Record<string, unknown>) {
  const response = await http.request({
    url: path,
    method,
    data: body,
    signal: body?.signal,
  })
  return response.data
}

type ClassroomRoute = keyof paths & string
type RouteOperation<P extends ClassroomRoute, M extends string> =
  Lowercase<M> extends keyof paths[P] ? paths[P][Lowercase<M>] : never
type RouteBody<P extends string, M extends string> =
  P extends ClassroomRoute ? RouteOperation<P, M> extends { body: infer B } ? B : never : never
type RouteResponse<P extends ClassroomRoute, M extends string> =
  RouteOperation<P, M> extends { response: infer R } ? R : never
type RequiredKeys<T> = { [K in keyof T]-?: Record<never, never> extends Pick<T, K> ? never : K }[keyof T]
type RouteOptions<P extends ClassroomRoute, M extends string> =
  (RouteOperation<P, M> extends { path: infer Path }
    ? [Path] extends [never] ? object : { path: Path } : never) &
  (RouteOperation<P, M> extends { query: infer Query }
    ? [Query] extends [never] ? object
      : [RequiredKeys<Query>] extends [never] ? { query?: Query } : { query: Query }
    : never) &
  ([RouteBody<P, M>] extends [never] ? { body?: never }
    : RouteOperation<P, M> extends { bodyRequired: true }
      ? { body: RouteBody<P, M> } : { body?: RouteBody<P, M> }) &
  { signal?: AbortSignal }
type JsonMethod<P extends ClassroomRoute> = {
  [M in keyof paths[P] & string]: paths[P][M] extends {
    requestMedia: 'application/json' | 'none'; responseMedia: 'application/json' | 'none'
  } ? Uppercase<M> : never
}[keyof paths[P] & string]

/** Strict JSON client; YAML import/export retain their dedicated helpers. */
export function typedApi<const P extends ClassroomRoute, const M extends JsonMethod<P>>(
  path: P,
  method: M,
  ...args: [RequiredKeys<RouteOptions<P, M>>] extends [never]
    ? [options?: RouteOptions<P, M>]
    : [options: RouteOptions<P, M>]
): Promise<RouteResponse<P, M>>
export async function typedApi(path: string, method: string, options: unknown = {}): Promise<unknown> {
  const input = options as {
    path?: Record<string, unknown>
    query?: Record<string, unknown>
    body?: unknown
    signal?: AbortSignal
  }
  const url = path.replace(/\{([^}]+)\}/g, (_, name: string) => encodeURIComponent(String(input.path?.[name] ?? '')))
  const query = new URLSearchParams()
  for (const [name, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== null) query.set(name, String(value))
  }
  const response = await http.request({
    url: query.toString() ? `${url}?${query}` : url,
    method,
    data: input.body,
    signal: input.signal,
  })
  return response.data
}

export function command(
  room,
  kind,
  data = {},
  actionId = crypto.randomUUID(),
) {
  return api(`/classrooms/${room}/commands`, 'POST', {
    kind,
    data,
    action_id: actionId,
  })
}

/** AI 協助設計：老師的需求＋目前草稿 → 一題建議（後端以 ai_script_authoring 角色的模型產生）。 */
export function scriptAssist(body: {
  request: string
  document: unknown
  question_index?: number | null
  script_id?: string | null
}) {
  return api('/scripts/assist', 'POST', body)
}

export async function importYAML(text) {
  const response = await http.post('/scripts/import', text, {
    headers: { 'Content-Type': 'application/yaml' },
  })
  return response.data
}

export async function exportYAML(id) {
  const response = await http.get(`/scripts/${id}/yaml`, {
    responseType: 'text',
  })
  return response.data
}

export type GroupAnalysis = components['schemas']['GroupAnalysisView']

/** 教師端的分組分析投影（假名化的原話、關係與立場分布）。 */
export function getGroupAnalysis(classroomId: string): Promise<GroupAnalysis> {
  return typedApi('/groups/classrooms/{rid}/analysis', 'GET', { path: { rid: classroomId } })
}

/** 前端可公開的設定（例如 debug_mode）。 */
export function getPublicConfig() {
  return api('/public-config')
}

export type FeedbackCreate = components['schemas']['FeedbackCreate']
export type FeedbackPage = components['schemas']['FeedbackPage']
export type FeedbackItem = components['schemas']['FeedbackItem']

/** 意見回饋：誰都能送；30 秒沒回應就放棄（spec P17），呼叫端保留使用者寫的內容。 */
export async function sendFeedback(body: FeedbackCreate, timeoutMs = 30_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await typedApi('/feedback', 'POST', { body, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** 回饋列表（只有名單上的帳號看得到，其他人一律 404）。 */
export function listFeedback(page: number) {
  return typedApi('/feedback', 'GET', { query: { page } })
}

/** 一則回饋的截圖，轉成 blob 給新分頁看（端點回 JSON，spec P16）。 */
export async function feedbackScreenshot(id: string): Promise<Blob> {
  const shot = await typedApi('/feedback/{feedback_id}/screenshot', 'GET', { path: { feedback_id: id } })
  const bytes = Uint8Array.from(atob(shot.data_base64), char => char.charCodeAt(0))
  return new Blob([bytes], { type: shot.mime })
}

export type ToggleView = components['schemas']['ToggleView']
export type AdminView = components['schemas']['AdminView']

/** 後台（後台 spec 〈介面〉）：非管理員一律 404 ADMIN_NOT_FOUND。 */
export function listToggles() {
  return typedApi('/admin/toggles', 'GET')
}

export function updateToggle(key: string, enabled: boolean) {
  return typedApi('/admin/toggles/{key}', 'PUT', { path: { key }, body: { enabled } })
}

export function listAdmins() {
  return typedApi('/admin/admins', 'GET')
}

export function addAdmin(username: string) {
  return typedApi('/admin/admins', 'POST', { body: { username } })
}

export function removeAdmin(accountId: string) {
  return typedApi('/admin/admins/{account_id}', 'DELETE', { path: { account_id: accountId } })
}

export type SystemAIView = components['schemas']['SystemAIView']
export type SystemAIInput = components['schemas']['SystemAIInput']

/** 系統 AI（後台 spec P31–P37）：讀取只給末四碼；測試與儲存都會真的送一句，儲存時後端再測一次。 */
export function getSystemAI() {
  return typedApi('/admin/system-ai', 'GET')
}

export function testSystemAI(body: SystemAIInput) {
  return typedApi('/admin/system-ai/test', 'POST', { body })
}

export function saveSystemAI(body: SystemAIInput) {
  return typedApi('/admin/system-ai', 'PUT', { body })
}

export type ModelOption = components['schemas']['ModelOption']
export type SystemAIModelsInput = components['schemas']['SystemAIModelsInput']

/** 這個服務有哪些可用的模型（後台 spec P40）；金鑰留空＝同服務同網址時用已存的。 */
export function listSystemAIModels(body: SystemAIModelsInput) {
  return typedApi('/admin/system-ai/models', 'POST', { body })
}

export type AIConnectionView = components['schemas']['AIConnectionView']
export type AIConnectionInput = components['schemas']['AIConnectionInput']
export type AIConnectionModelsInput = components['schemas']['AIConnectionModelsInput']
export type AIConnectionUsageView = components['schemas']['AIConnectionUsageView']

/** 老師的 AI 連線設定（一組連線、全部 AI 共用）：讀取只給末四碼；套用時後端先測、成功才存。 */
export function getAIConnection() {
  return typedApi('/ai-settings/connection', 'GET')
}

export function testAIConnection(body: AIConnectionInput) {
  return typedApi('/ai-settings/connection/test', 'POST', { body })
}

export function applyAIConnection(body: AIConnectionInput) {
  return typedApi('/ai-settings/connection', 'PUT', { body })
}

/** 系統提供＝停用自己的連線、金鑰保留；own＝切回保留的金鑰，不重新測試。 */
export function setAIConnectionMode(mode: 'system' | 'own') {
  return typedApi('/ai-settings/connection/mode', 'PUT', { body: { mode } })
}

/** 金鑰留空＝同服務同網址時用已存的。OpenRouter 只列支援 reasoning 的模型。 */
export function listAIConnectionModels(body: AIConnectionModelsInput) {
  return typedApi('/ai-settings/connection/models', 'POST', { body })
}

export function getAIConnectionUsage() {
  return typedApi('/ai-settings/connection/usage', 'GET')
}

/** 部署版本（GET /api/release，不在 /api/v2 底下）。 */
export async function getRelease() {
  const response = await http.get('/release', { baseURL: '/api' })
  return response.data
}

/** The live classroom event stream; one of the two places the app opens a WebSocket. */
export function openClassroomSocket(roomId: string, mode: string, lastSeq: number): WebSocket {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return new WebSocket(`${scheme}://${location.host}/api/v2/classrooms/${roomId}/ws?mode=${mode}&last_seq=${lastSeq}`);
}

/** Solo voice mode: microphone audio out, Socrates' audio, captions and the attempt view in.
 * The browser never talks to the voice model itself; the backend relays and checks everything. */
export function openSoloVoiceSocket(attemptId: string): WebSocket {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(`${scheme}://${location.host}/api/v2/solo/attempts/${encodeURIComponent(attemptId)}/voice`);
  socket.binaryType = 'arraybuffer';
  return socket;
}

export type DeleteAccountResponse = components['schemas']['DeleteAccountView']

export function checkAccountDeletion(signal?: AbortSignal) {
  return typedApi('/account/deletion-check', 'GET', { signal })
}

/** 刪除目前登入帳號；成功後由呼叫端清除前端登入狀態。 */
export async function deleteAccount(
  username: string,
): Promise<DeleteAccountResponse> {
  return typedApi('/account', 'DELETE', { body: { username } })
}
