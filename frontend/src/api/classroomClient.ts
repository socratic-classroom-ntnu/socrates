import axios from 'axios'
import { errorText } from './errorText'

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
    recordApiError(failure, { method: error.config?.method, path: requestPath(error.config) })
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

/** 前端可公開的設定（例如 debug_mode）。 */
export function getPublicConfig() {
  return api('/public-config')
}

/** 部署版本（GET /api/release，不在 /api/v2 底下）。 */
export async function getRelease() {
  const response = await http.get('/release', { baseURL: '/api' })
  return response.data
}
