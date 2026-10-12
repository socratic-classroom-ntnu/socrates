// 劇本欄位檢查：與後端 ScriptDocument／Question／Option 的限制一致（backend/app/api/classroom_schemas.py），
// 讓老師在儲存前就看到哪一格要改；後端回 422 時，也把它的錯誤位置換成同一套欄位說明。

export type FieldError = { path: string; message: string }

const isInt = value => Number.isInteger(value)

function text(errors: FieldError[], path: string, label: string, value, max: number) {
  const s = typeof value === 'string' ? value.trim() : ''
  if (!s) errors.push({ path, message: `${label}請填寫` })
  else if (s.length > max) errors.push({ path, message: `${label}最多 ${max} 字` })
}

function int(errors: FieldError[], path: string, label: string, value, min: number, max?: number) {
  if (!isInt(value)) errors.push({ path, message: `${label}請填整數` })
  else if (value < min) errors.push({ path, message: `${label}至少 ${min}` })
  else if (max !== undefined && value > max) errors.push({ path, message: `${label}最多 ${max}` })
}

/** 回傳所有不符合後端限制的欄位；空陣列表示可以儲存。 */
export function validateDocument(doc): FieldError[] {
  const errors: FieldError[] = []
  text(errors, 'title', '劇本名稱', doc?.title, 300)
  int(errors, 'max_questions', '動態題目總數', doc?.max_questions, 1)
  int(errors, 'live_llm_call_budget', 'Live LLM 額度', doc?.live_llm_call_budget, 0)
  int(errors, 'preview_seconds', '預覽秒數', doc?.preview_seconds, 5, 10)
  const questions = Array.isArray(doc?.questions) ? doc.questions : []
  if (!questions.length) errors.push({ path: 'questions', message: '至少要有 1 題' })
  questions.forEach((q, i) => {
    const at = `questions.${i}`
    const name = `情境 ${i + 1} 的`
    text(errors, `${at}.title`, `${name}標題`, q.title, 300)
    text(errors, `${at}.scenario`, `${name}情境敘述`, q.scenario, 12000)
    const options = Array.isArray(q.options) ? q.options : []
    if (options.length < 2) errors.push({ path: `${at}.options`, message: `${name}選項至少要 2 個` })
    options.forEach((o, j) => text(errors, `${at}.options.${j}.text`, `${name}選項 ${j + 1}`, o.text, 2000))
    int(errors, `${at}.duration_seconds`, `${name}作答秒數`, q.duration_seconds, 1)
    int(errors, `${at}.max_focus_turns`, `${name}每位代表最多來回`, q.max_focus_turns, 1)
    int(errors, `${at}.focus_response_seconds`, `${name}追問回應秒數`, q.focus_response_seconds, 5)
    int(errors, `${at}.sender_point_cap`, `${name}送出者每回合積分上限`, q.sender_point_cap, 0)
    int(errors, `${at}.receiver_point_cap`, `${name}接收者每回合積分上限`, q.receiver_point_cap, 0)
    // 分組課堂的個人對話；舊劇本沒有這兩欄時由後端補預設值。
    if (q.max_personal_turns !== undefined) int(errors, `${at}.max_personal_turns`, `${name}個人對話回覆上限`, q.max_personal_turns, 1, 20)
    if (q.personal_seconds !== undefined) int(errors, `${at}.personal_seconds`, `${name}個人對話秒數`, q.personal_seconds, 30)
  })
  return errors
}

const FIELD_LABELS = {
  title: '標題', scenario: '情境敘述', options: '選項', text: '文字', duration_seconds: '作答秒數',
  max_focus_turns: '每位代表最多來回', focus_response_seconds: '追問回應秒數',
  max_personal_turns: '個人對話回覆上限', personal_seconds: '個人對話秒數',
  sender_point_cap: '送出者每回合積分上限', receiver_point_cap: '接收者每回合積分上限',
  max_questions: '動態題目總數', live_llm_call_budget: 'Live LLM 額度', preview_seconds: '預覽秒數', questions: '題目', mode: '題目模式',
}

// FastAPI／pydantic 常見的限制錯誤換成中文；其他類型保留伺服器原文。
function reason(item): string {
  const ctx = item?.ctx || {}
  switch (item?.type) {
    case 'missing': return '請填寫'
    case 'string_too_short': return ctx.min_length > 1 ? `至少 ${ctx.min_length} 字` : '請填寫'
    case 'string_too_long': return `最多 ${ctx.max_length} 字`
    case 'too_short': return `至少要 ${ctx.min_length} 個`
    case 'too_long': return `最多 ${ctx.max_length} 個`
    case 'greater_than_equal': return `至少 ${ctx.ge}`
    case 'less_than_equal': return `最多 ${ctx.le}`
    case 'greater_than': return `要大於 ${ctx.gt}`
    case 'less_than': return `要小於 ${ctx.lt}`
    case 'int_type': case 'int_parsing': case 'int_from_float': return '請填整數'
    case 'model_type': return '需要 YAML 鍵值物件'
    case 'list_type': return '需要清單格式'
    case 'literal_error': return ctx.expected ? `請使用 ${String(ctx.expected).replaceAll(' or ', ' 或 ')}` : '值不在允許範圍內'
    case 'extra_forbidden': return '這個欄位不在劇本格式內'
    case 'value_error': return String(ctx.error || item?.msg || '內容不符')
    default: return String(item?.msg || '格式不符')
  }
}

/** 後端 422 的 detail（[{ loc, msg, type, ctx }]）→ 欄位錯誤；loc 以 body／document 開頭的部分略過。 */
export function fieldErrorsFrom422(detail): FieldError[] {
  if (!Array.isArray(detail)) return []
  return detail.map(item => {
    const loc = (Array.isArray(item?.loc) ? item.loc : []).filter(part => part !== 'body' && part !== 'document')
    const path = loc.join('.')
    const words: string[] = []
    for (let k = 0; k < loc.length; k += 1) {
      const part = loc[k]
      if (part === 'questions' && Number.isInteger(loc[k + 1])) { words.push(`情境 ${loc[k + 1] + 1}`); k += 1 }
      else if (part === 'options' && Number.isInteger(loc[k + 1])) { words.push(`選項 ${loc[k + 1] + 1}`); k += 1 }
      else if (typeof part === 'string') words.push(FIELD_LABELS[part] || part)
    }
    const where = words.join('・') || '劇本'
    return { path, message: `${where}：${reason(item)}` }
  })
}
