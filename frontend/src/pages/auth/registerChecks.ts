// 註冊欄位的前端預檢與後端 422 對照，輸出「欄位＋種類」，由頁面依目前語系翻譯。
// 上限與後端 Register 一致（backend/app/modules/classroom_core/api/classroom_schemas.py）。
export const REGISTER_LIMITS = { username: [3, 64], email: [3, 254], password: [12, 256] } as const;
export type Field = keyof typeof REGISTER_LIMITS;
export type Problem = { field: Field; kind: 'missing' | 'tooShort' | 'tooLong' | 'format' | 'pattern'; min?: number; max?: number };

// 後端 username pattern ^[\w.-]+$ 的 \w 是 Unicode（中文等文字也可以）。
const USERNAME_RE = /^[\p{Alphabetic}\p{M}\p{Nd}\p{Pc}\p{Join_Control}.-]+$/u;
// 後端只要求 @ 後面有點；這裡同樣要求網域有點（123@g 會被擋下），也不允許空白。
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELDS: readonly Field[] = ['username', 'email', 'password'];
const chars = (value: string) => Array.from(value).length;

function lengthProblem(field: Field, value: string): Problem | null {
  const [min, max] = REGISTER_LIMITS[field];
  if (!value) return { field, kind: 'missing' };
  // Email 太短一律說「格式不正確」，和後端錯誤的說法一致。
  if (chars(value) < min) return field === 'email' ? { field, kind: 'format' } : { field, kind: 'tooShort', min };
  if (chars(value) > max) return { field, kind: 'tooLong', max };
  return null;
}

export function registerProblems(values: Record<Field, string>): Problem[] {
  const problems: Problem[] = [];
  const user = lengthProblem('username', values.username)
    ?? (USERNAME_RE.test(values.username) ? null : { field: 'username', kind: 'pattern' } as Problem);
  if (user) problems.push(user);
  const mail = lengthProblem('email', values.email)
    ?? (EMAIL_RE.test(values.email) ? null : { field: 'email', kind: 'format' } as Problem);
  if (mail) problems.push(mail);
  const secret = lengthProblem('password', values.password);
  if (secret) problems.push(secret);
  return problems;
}

/** FastAPI 422 detail → 每個認得的欄位留第一個問題。 */
export function problemsFrom422(detail: unknown): Problem[] {
  if (!Array.isArray(detail)) return [];
  const found: Problem[] = [];
  for (const issue of detail) {
    const { loc, type, ctx } = (issue ?? {}) as { loc?: unknown; type?: unknown; ctx?: Record<string, unknown> };
    const field = Array.isArray(loc) ? loc[loc.length - 1] : undefined;
    if (!FIELDS.includes(field as Field) || found.some(p => p.field === field)) continue;
    const f = field as Field;
    if (type === 'missing') found.push({ field: f, kind: 'missing' });
    else if (type === 'string_too_long') found.push({ field: f, kind: 'tooLong', max: Number(ctx?.max_length) });
    else if (type === 'string_too_short' && f !== 'email') found.push({ field: f, kind: 'tooShort', min: Number(ctx?.min_length) });
    else if (type === 'string_pattern_mismatch' && f === 'username') found.push({ field: f, kind: 'pattern' });
    else found.push({ field: f, kind: 'format' });
  }
  return found;
}
