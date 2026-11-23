import { ApiError } from '../../contract/classroomClient'
import { useT } from '../../i18n/useT'

export const COMPATIBLE = 'openai-compatible'
/** 服務名稱是產品名，不翻譯；只有「自訂相容服務」照頁面語言。 */
const PRODUCTS: Record<string, string> = {
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
}
export const ADAPTERS = [...Object.keys(PRODUCTS), COMPATIBLE]

/** 「取得金鑰」（需求〈已知的坑〉）；自訂相容服務沒有連結。 */
export const KEY_PAGES: Record<string, string> = {
  openrouter: 'https://openrouter.ai/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  gemini: 'https://aistudio.google.com/apikey',
}
/** 「前往後台」與「補充額度」；需求沒給 Gemini 的後台，就不放連結。 */
export const CONSOLES: Record<string, string> = {
  openrouter: 'https://openrouter.ai/settings/credits',
  openai: 'https://platform.openai.com/usage',
  anthropic: 'https://console.anthropic.com/settings/billing',
}

export function useServiceName() {
  const { t } = useT('teach')
  return (adapter: string | null | undefined) =>
    adapter === COMPATIBLE ? t('aiSettings.compatible') : PRODUCTS[adapter ?? ''] ?? adapter ?? ''
}

export type FieldName = 'adapter' | 'model' | 'apiKey' | 'baseUrl' | 'name'

/** 哪個錯誤標在哪一欄；其餘（額度、逾時、連不上、被別的分頁改過）放頁面頂端。 */
export const FIELD_OF: Record<string, FieldName> = {
  AI_CONNECTION_ADAPTER_INVALID: 'adapter',
  AI_CONNECTION_MODEL_REQUIRED: 'model',
  AI_CONNECTION_MODEL_INVALID: 'model',
  AI_CONNECTION_MODEL_NOT_FOUND: 'model',
  AI_CONNECTION_KEY_REQUIRED: 'apiKey',
  AI_CONNECTION_KEY_MALFORMED: 'apiKey',
  AI_CONNECTION_KEY_INVALID: 'apiKey',
  AI_CONNECTION_BASE_URL_REQUIRED: 'baseUrl',
  AI_CONNECTION_BASE_URL_INVALID: 'baseUrl',
  AI_CONNECTION_BASE_URL_NOT_ALLOWED: 'baseUrl',
  AI_CONNECTION_NAME_INVALID: 'name',
  AI_CONNECTION_NAME_TAKEN: 'name',
}

/** The backend's error code, or '' for anything else (the message then comes from ApiError). */
export function codeOf(failure: unknown): string {
  return failure instanceof ApiError && typeof failure.detail === 'string' ? failure.detail : ''
}

/** Two decimals, US dollars; nothing left shows as $0.00. */
export function dollars(value: number): string {
  return `$${Math.max(0, value).toFixed(2)}`
}

const KNOWN = new Set([
  ...Object.keys(FIELD_OF),
  'AI_CONNECTION_QUOTA', 'AI_CONNECTION_TIMEOUT', 'AI_CONNECTION_UNREACHABLE', 'AI_CONNECTION_CHANGED',
  'AI_CONNECTION_SYSTEM_UNAVAILABLE', 'AI_CONNECTION_NO_KEPT_KEY',
])

/** A failure as this page says it, in the page's language: its code and the sentence for it. */
export function useFailureText() {
  const { t } = useT('teach')
  return (failure: unknown) => {
    const code = codeOf(failure)
    return { code, message: t(`aiSettings.errors.${KNOWN.has(code) ? code : 'generic'}`) }
  }
}
