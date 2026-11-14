// 帳號只有一個角色（學生或老師）：哪些網址屬於哪一邊。依路徑開頭判斷，結尾斜線不影響；
// 不在這裡的網址兩邊都能開（首頁、分組課、個人設定、示範頁……）。
export type PageSide = 'student' | 'teacher'

const STUDENT = [/^\/learn(\/|$)/, /^\/join\/?$/, /^\/activities\/[^/]+\/join\/?$/, /^\/scan\/?$/]
const TEACHER = [/^\/teach(\/|$)/, /^\/teacher(\/|$)/]

export function pageSide(pathname: string): PageSide | null {
  if (STUDENT.some(pattern => pattern.test(pathname))) return 'student'
  if (TEACHER.some(pattern => pattern.test(pathname))) return 'teacher'
  return null
}
