import axios from 'axios'

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
    let data = null
    if (config.responseType === 'text' && typeof response.text === 'function') {
      data = await response.text()
    } else if (contentType.includes('application/json')) {
      data = await response.json()
    } else {
      const preview = typeof response.text === 'function' ? await response.text() : ''
      data = {
        detail: 'API_ROUTE_JSON_REQUIRED',
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
    super(typeof detail === 'string' ? detail : `API ${status}`)
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

http.interceptors.response.use(
  response => response,
  error => {
    const status = error.response?.status || 0
    const detail =
      error.response?.data?.detail ??
      error.response?.data ??
      error.message
    return Promise.reject(new ApiError(status, detail))
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
