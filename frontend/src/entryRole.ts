// 「我是學生／我是老師」只是入口分流，不是權限：後端帳號沒有身份欄位，
// 誰建立教室誰就是那間教室的老師。要做成權限得先在後端加 role。
export type EntryRole = 'student' | 'teacher'

const KEY = 'socrates.entryRole'
const ROLES: EntryRole[] = ['student', 'teacher']

export function roleFromPath(pathname: string): EntryRole | null {
  const match = pathname.match(/^\/(student|teacher)\/?$/)
  return match ? (match[1] as EntryRole) : null
}

export function storedRole(): EntryRole | null {
  try {
    const value = localStorage.getItem(KEY)
    return ROLES.includes(value as EntryRole) ? (value as EntryRole) : null
  } catch {
    return null
  }
}

export function rememberRole(role: EntryRole | null) {
  try {
    if (role) localStorage.setItem(KEY, role)
    else localStorage.removeItem(KEY)
  } catch { /* 無痕模式等情況存不了，就每次重選 */ }
}
