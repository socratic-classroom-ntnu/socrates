// 後端錯誤碼（DomainError／ApiError.detail）→ 使用者看得懂的中文。
// 後端已是中文句子的 detail 原樣顯示；查不到的代碼顯示通用說明並附代碼，方便回報。

const CODES: Record<string, string> = {
  ACCOUNT_DATA_TAKEN: '帳號資料已經有人使用，請前往登入或重設密碼。',
  AUTH_INVALID_CREDENTIALS: '請確認登入資料。',
  AUTH_TOKEN_INVALID: '這個連結已經失效，請重新申請。',
  ACTION_ID_PAYLOAD_CONFLICT: '這個操作已經用不同內容送出過，請重新整理後再試。',
  ACCOUNT_PENDING_VERIFICATION: '這個使用者名稱或 Email 已註冊，正在等待 Email 驗證。如果是你的帳號，請直接登入並重新寄送驗證信；如果不是，等驗證連結過期（最後一次寄出後 24 小時）就會釋出，屆時可以再註冊。',
  ACTION_SCOPE_REQUIRED: '這個操作不適用於目前的對象。',
  AI_BUDGET_REQUIRED: 'AI 呼叫次數已用完，請到 AI 設定提高上限。',
  AI_MODEL_ID_REQUIRED: '請選擇或輸入 AI 模型。',
  AI_ROLE_REQUIRED: '請指定這個 AI 的角色。',
  ANSWER_ALREADY_SUBMITTED: '這一題已經作答過了。',
  ANSWER_WINDOW_CLOSED: '作答時間已結束。',
  ARENA_REQUIRED: '目前不在討論階段。',
  ARGUMENT_RELATION_REQUIRED: '請選擇論點之間的關係。',
  ARGUMENT_REQUIRED: '請寫下你的理由。',
  ARGUMENT_SIZE: '理由太長了，請精簡後再送出。',
  BARRAGE_SIZE: '訊息太長了，請精簡後再送出。',
  BANK_IMPORT_INVALID: '加入這一題後，劇本內容不符合格式，請先檢查劇本再試。',
  BANK_OWNER_REQUIRED: '只有發布這道題目的老師可以下架它。',
  BANK_QUESTION_INVALID: '這一題的內容還不完整，請先在編輯器補齊後再發布。',
  BANK_QUESTION_REQUIRED: '找不到這道題目，可能已被發布者下架。',
  BANK_SCRIPT_QUESTION_LIMIT: '這份劇本的題目已達上限（50 題），請改加入其他劇本。',
  BANK_SOURCE_QUESTION_REQUIRED: '劇本裡找不到這一題，請重新整理後再發布。',
  BUDGET_RANGE: '上限數值超出允許範圍。',
  CLASSROOM_ASSET_OWNER_REQUIRED: '只有課程建立者可以修改這門課。',
  CLASSROOM_MEMBERSHIP_REQUIRED: '你還不是這個課堂的成員，請先輸入課程代碼加入。',
  CLASSROOM_OWNER_REQUIRED: '只有課堂建立者可以進行這個操作。',
  CLASSROOM_PARENT_REQUIRED: '找不到所屬的課堂。',
  CLASSROOM_REQUIRED: '找不到這個課堂。',
  CLASSROOM_SCRIPT_REQUIRED: '這門課還沒有題目，請先建立或掛上劇本。',
  COMPLETE_FINAL_STAGE_REQUIRED: '最終反思階段還沒結束。',
  CONFIRMABLE_PHASE_REQUIRED: '所有題目與代表討論結束後，才能確認觀點。',
  COURSE_CODE_NOT_FOUND: '找不到這個課程代碼，請確認後再輸入。',
  COURSE_CODE_REQUIRED: '請輸入課程代碼。',
  CURRENT_GROUP_CONFIGURATION_REQUIRED: '分組設定已變更，請重新整理後再操作。',
  CURRENT_PHASE_ACTIONS: '目前階段不能進行這個操作。',
  CURRENT_POPULATED_ROSTER_REQUIRED: '還沒有學生入座，請等學生加入後再分組。',
  CURRENT_ROSTER_DIGEST_REQUIRED: '學生名單已變動，請重新整理後再分組。',
  CURRENT_ROSTER_REQUIRED: '學生名單已變動，請重新整理後再操作。',
  CURRENT_SUMMARY_DIGEST_REQUIRED: '你要確認的內容剛更新過，請重新讀一次再確認。',
  DIALOGUE_PHASE_REQUIRED: '目前不在對話階段。',
  EMAIL_TAKEN: '這個 Email 已經註冊過了，請直接登入；忘記密碼可以重設。',
  EMAIL_VERIFICATION_REQUIRED: '請先完成 Email 驗證。',
  EXISTING_GROUP_ARGUMENT_REQUIRED: '要回應的那則原話已不存在，請重新選擇。',
  FOCUS_ID_REQUIRED: '找不到這段代表討論。',
  FOCUS_REQUIRED: '目前沒有進行中的代表討論。',
  FOCUS_TURN_REQUIRED: '這一輪討論已經結束。',
  FRESH_ARGUMENT_ID_REQUIRED: '這則內容已經送出過了。',
  GROUP_CAPACITY_REQUIRED: '分組容量不夠：入座學生比「組數 × 每組人數」多，或有一組超過每組人數。請增加組數或每組人數。',
  GROUP_COMMAND_REQUIRED: '分組課堂不支援這個操作。',
  GROUP_INDEX_REQUIRED: '找不到這個組別。',
  GROUP_MEMBERSHIP_REQUIRED: '你不在這個組別裡。',
  GROUP_MEMBER_REQUIRED: '找不到這位組員。',
  GROUP_RUN_REQUIRED: '找不到這個組別的課堂。',
  KNOWN_ACTION_REQUIRED: '不支援這個操作。',
  LOBBY_REQUIRED: '課堂已經開始，這個操作只能在開課前進行。',
  LOGIN_REQUIRED: '請先登入。',
  ORIGIN_BINDING_REQUIRED: '請從正式網址開啟本網站後再試。',
  PERSONAL_CONFIRM_REQUIRED: '導師的摘要還沒準備好，或已經處理過，請重新整理後再操作。',
  PERSONAL_DIALOGUE_REQUIRED: '你在這一題還沒有個人對話，請先作答。',
  PERSONAL_RETRY_REQUIRED: '導師已恢復回應，不需要重試。',
  PERSONAL_TURN_REQUIRED: '請等導師回覆後再送出下一則訊息。',
  PERSONAL_WINDOW_CLOSED: '這一題的個人對話已結束，不再接受新的回覆。',
  PREVIEW_REQUIRED: '目前不在題目預覽階段。',
  PROVIDER_ADAPTER_REQUIRED: '請選擇 AI 服務。',
  PROVIDER_AVAILABILITY: 'AI 服務暫時無法使用，請稍後再試。',
  PROVIDER_EMPTY_CONTENT: 'AI 服務這次沒有回傳內容，請再試一次或改選其他模型。',
  PROVIDER_SCHEMA_MISMATCH: 'AI 服務回傳的內容格式不符合這項功能，請改選支援結構化輸出的模型。',
  PROVIDER_TIMEOUT: 'AI 服務回應時間較長，請稍後再試。',
  PROVIDER_BASE_URL_REQUIRED: '這個 AI 服務需要填自訂服務網址。',
  PROVIDER_CREDENTIAL_DECRYPTION: '保存的 API 金鑰無法讀取，請重新輸入金鑰。',
  PROVIDER_CREDENTIAL_REENTRY_REQUIRED: '請重新輸入 API 金鑰。',
  PROVIDER_CREDENTIAL_REQUIRED: '這個連線還沒有 API 金鑰，請先填入金鑰。',
  PROVIDER_HOST_RESOLUTION: '找不到這個服務網址，請檢查自訂服務網址。',
  PROVIDER_HTTPS_REQUIRED: '自訂服務網址必須是 https。',
  PROVIDER_KEY_SOURCE_REQUIRED: '伺服器尚未設定金鑰加密，請聯絡管理者。',
  PROVIDER_PROFILE_IN_ACCOUNT_SETTINGS: '這個連線正被帳號 AI 預設值使用，請先改用其他連線。',
  PROVIDER_PROFILE_IN_AI_STUDENT: '這個連線正被 AI 學生使用，請先改用其他連線。',
  PROVIDER_PROFILE_IN_CLASSROOM_SETTINGS: '這個連線正被課堂 AI 設定使用，請先改用其他連線。',
  PROVIDER_PROFILE_IN_SCRIPT: '這個連線正被劇本中的題目使用，請先把那些題目改回「沿用課堂設定」或改用其他連線。',
  PROVIDER_PROFILE_OWNER_REQUIRED: '這不是你建立的 AI 連線。',
  PROVIDER_PUBLIC_ADDRESS_REQUIRED: '自訂服務網址必須是公開網址。',
  PROVIDER_REDIRECT_BOUND: 'AI 服務轉址太多次，請檢查自訂服務網址。',
  PROVIDER_REDIRECT_LOCATION: 'AI 服務轉址到不允許的位置。',
  PROVIDER_RESPONSE_SIZE: 'AI 服務回應太大。',
  QUESTION_ID_REQUIRED: '找不到這一題。',
  QUESTION_OPTION_REQUIRED: '請先選擇一個選項。',
  QUESTION_REQUIRED: '找不到這一題。',
  QUOTED_VIEWPOINT_REQUIRED: '請先寫下你的原話，再確認觀點。',
  SCENARIO_AI_PROFILE_REQUIRED: '有題目指定的 AI 連線已不存在或不是你建立的，請重新選擇，或改回「沿用課堂設定」。',
  SCRIPT_ASSIST_DRAFT_SIZE: '目前劇本內容太長，請精簡後再請 AI 協助。',
  SCRIPT_ASSIST_INVALID_OUTPUT: 'AI 這次的建議內容不完整，請再試一次或換個說法。',
  SCRIPT_ASSIST_MODEL_REQUIRED: '還沒有指定「AI 劇本協作」要用的模型，請到帳號 AI 設定選擇模型。',
  SCRIPT_ASSIST_PROVIDER_REQUIRED: '還沒有可用的 AI 連線，請到帳號 AI 設定選擇預設連線並填入 API 金鑰。',
  SCRIPT_OWNER_REQUIRED: '這不是你建立的劇本。',
  SCRIPT_SAMPLES_UNAVAILABLE: '目前讀不到範例題目，請稍後再試，或改用 AI 協助出題、從題庫加入。',
  SESSION_CSRF_REQUIRED: '登入狀態已過期，請重新整理頁面。',
  STARTED_CLASSROOM_REQUIRED: '課堂還沒開始。',
  STATEMENT_LENGTH_1_TO_12000: '內容請寫 1 到 12000 字。',
  STUDENT_MEMBERSHIP_REQUIRED: '只有課堂中的學生可以進行這個操作。',
  SUMMARY_PHASE_REQUIRED: '總結還沒產生。',
  TEACHER_MEMBERSHIP_REQUIRED: '只有這堂課的老師可以進行這個操作。',
  TEACHER_TEMPORARY_ALIAS_CONFIRMATION_REQUIRED: '請先確認老師的暫用名稱。',
  TYPED_STATEMENT_AND_PARENT_IDS_REQUIRED: '請寫下內容並選擇要回應的原話。',
  USERNAME_TAKEN: '這個使用者名稱已經有人使用，請換一個。',
  API_ROUTE_JSON_REQUIRED: '伺服器暫時無法處理這個請求，請稍後再試。',
}

const STATUS: Record<number, string> = {
  400: '送出的內容有誤，請檢查後再試。',
  401: '請先登入。',
  403: '你沒有權限進行這個操作。',
  404: '找不到要操作的內容。',
  409: '內容已被更新，請重新整理後再試。',
  413: '內容太大，請精簡後再送出。',
  422: '有欄位內容不符合格式，請檢查後再試。',
  424: 'AI 服務目前無法完成這個請求，請檢查連線或模型後再試。',
  429: '操作太頻繁，請稍候再試。',
}

const CODE_RE = /^[A-Z][A-Z0-9_]{3,}$/

// FastAPI 422 的 detail 是陣列（loc 最後一段＝欄位名）。認得的欄位轉成針對該欄位的中文說明。
const FIELDS: Record<string, string> = { email: 'Email', username: '使用者名稱', password: '密碼' }

export type FieldError = { field: string; text: string }

const withLabel = (label: string, rest: string) => (/^[A-Za-z]/.test(label) ? `${label} ${rest}` : label + rest)

/** 單一欄位驗證錯誤的中文（type／ctx 沿用 Pydantic 的錯誤型別與限制值）。 */
export function fieldText(field: string, type?: string, ctx: Record<string, unknown> = {}): string {
  const label = FIELDS[field] || field
  if (type === 'missing') return /^[A-Za-z]/.test(label) ? `請填寫 ${label}。` : `請填寫${label}。`
  if (type === 'string_too_long' && ctx.max_length !== undefined)
    return withLabel(label, `最多 ${ctx.max_length} 個字元，請重新輸入。`)
  if (type === 'string_too_short' && ctx.min_length !== undefined && field !== 'email')
    return withLabel(label, `至少要 ${ctx.min_length} 個字元，請重新輸入。`)
  if (type === 'string_pattern_mismatch' && field === 'username')
    return '使用者名稱只能用文字、數字、底線（_）、點（.）或連字號（-），不能有空格。'
  return withLabel(label, '格式不正確，請重新輸入。')
}

/** 把 422 detail 陣列轉成「欄位 → 中文」；每個欄位只留第一個錯誤，認不得的欄位略過。 */
export function fieldErrors(detail: unknown): FieldError[] {
  if (!Array.isArray(detail)) return []
  const found: FieldError[] = []
  for (const issue of detail) {
    if (!issue || typeof issue !== 'object') continue
    const { loc, type, ctx } = issue as { loc?: unknown; type?: unknown; ctx?: unknown }
    const field = Array.isArray(loc) ? loc[loc.length - 1] : undefined
    if (typeof field !== 'string' || !FIELDS[field] || found.some(f => f.field === field)) continue
    found.push({
      field,
      text: fieldText(field, typeof type === 'string' ? type : undefined, ctx && typeof ctx === 'object' ? (ctx as Record<string, unknown>) : {}),
    })
  }
  return found
}

/** 把後端錯誤 detail（或 HTTP 狀態）換成給使用者看的中文。 */
export function errorText(detail: unknown, status?: number): string {
  if (status === 422) {
    const fields = fieldErrors(detail)
    if (fields.length) return fields.map(f => f.text).join(' ')
  }
  if (typeof detail === 'string' && detail.trim()) {
    const code = detail.trim()
    if (CODES[code]) return CODES[code]
    if (code.startsWith('PROVIDER_HTTP_')) {
      const http = Number(code.slice('PROVIDER_HTTP_'.length))
      if (http === 401 || http === 403) return 'AI 服務拒絕了這組 API 金鑰，請確認金鑰是否正確。'
      if (http === 404) return 'AI 服務找不到這個模型，請改選其他模型。'
      if (http === 429) return 'AI 服務請求太頻繁或額度不足，請稍後再試。'
      return `AI 服務回應錯誤（${http || code}），請稍後再試。`
    }
    if (CODE_RE.test(code)) return `操作沒有完成（代碼 ${code}）。`
    return code
  }
  if (status && STATUS[status]) return STATUS[status]
  if (status && status >= 500) return '伺服器暫時無法處理，請稍後再試。'
  return status ? `操作沒有完成（HTTP ${status}）。` : '操作沒有完成，請稍後再試。'
}
