// 註冊欄位的前端預檢與後端 422 對照，輸出「欄位＋種類」，由頁面依目前語系翻譯。
// 上限、使用者名稱與密碼規則都與後端 Register 一致（backend/app/modules/identity_access/contracts.py）。
export const REGISTER_LIMITS = { username: [3, 32], email: [3, 254], password: [8, 32] } as const;
// 登入不套新規則：舊規則設定的長密碼（最多 256 字）仍要能登入。
export const LOGIN_PASSWORD_MAX = 256;
export type Field = keyof typeof REGISTER_LIMITS;
export type Problem = { field: Field; kind: 'missing' | 'tooShort' | 'tooLong' | 'format' | 'pattern' | 'policy'; min?: number; max?: number };

// 後端 USERNAME_PATTERN：英文字母開頭，字母或數字結尾，中間可用數字、底線、點、連字號。
const USERNAME_RE = /^[A-Za-z][A-Za-z0-9_.-]*[A-Za-z0-9]$/;
// 後端 PASSWORD_SPECIALS：密碼要有大寫、小寫、數字與其中一個特殊字元，其他字元都不收。
export const PASSWORD_SPECIALS = '!@#$%^&*_-+=.?~';
const passwordChar = (c: string) => /[A-Za-z0-9]/.test(c) || PASSWORD_SPECIALS.includes(c);
// 後端只要求 @ 後面有點；這裡同樣要求網域有點（123@g 會被擋下），也不允許空白。
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELDS: readonly Field[] = ['username', 'email', 'password'];
const chars = (value: string) => Array.from(value).length;

export function passwordOk(value: string): boolean {
  const list = Array.from(value);
  return list.every(passwordChar)
    && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value) && list.some(c => PASSWORD_SPECIALS.includes(c));
}

/** 新密碼欄位只留下允許的字元（最多 32 個）；擋下的字元各列一次，由頁面依語系說明。 */
export function keepPasswordChars(value: string): { kept: string; blocked: string[] } {
  const list = Array.from(value);
  return {
    kept: list.filter(passwordChar).slice(0, REGISTER_LIMITS.password[1]).join(''),
    blocked: [...new Set(list.filter(c => !passwordChar(c)))],
  };
}

/** 新密碼（註冊、重設）的預檢：長度，再看組成。 */
export function passwordProblem(password: string): Problem | null {
  return lengthProblem('password', password) ?? (passwordOk(password) ? null : { field: 'password', kind: 'policy' });
}

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
  const secret = passwordProblem(values.password);
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
    else if (type === 'password_policy' && f === 'password') found.push({ field: f, kind: 'policy' });
    else found.push({ field: f, kind: 'format' });
  }
  return found;
}
