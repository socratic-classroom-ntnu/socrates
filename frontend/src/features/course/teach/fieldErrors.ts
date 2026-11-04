// 表單欄位錯誤：前端預檢與後端 422 都轉成「欄位＋種類」，由頁面依語系翻譯。
export type FieldProblem = { kind: 'required' | 'tooLong' | 'invalid'; max?: number }

/** FastAPI 422 detail → the first problem of each field this form knows. */
export function fieldProblemsFrom422<F extends string>(detail: unknown, fields: readonly F[]): Partial<Record<F, FieldProblem>> {
  const found: Partial<Record<F, FieldProblem>> = {}
  if (!Array.isArray(detail)) return found
  for (const issue of detail) {
    const { loc, type, ctx } = (issue ?? {}) as { loc?: unknown; type?: unknown; ctx?: Record<string, unknown> }
    const field = Array.isArray(loc) ? loc[loc.length - 1] : undefined
    if (!fields.includes(field as F) || found[field as F]) continue
    if (type === 'missing' || type === 'string_too_short') found[field as F] = { kind: 'required' }
    else if (type === 'string_too_long') found[field as F] = { kind: 'tooLong', max: Number(ctx?.max_length) }
    else found[field as F] = { kind: 'invalid' }
  }
  return found
}
