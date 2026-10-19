// 教師端網址要顯示哪一頁。教師端每一頁都打 /library/*，未驗證帳號會被後端 403，
// 所以先導去驗證，不要停在不能用的畫面。
export type TeacherRoute =
  | { page: 'verify' }
  | { page: 'home' }
  | { page: 'course'; courseId: string }

export function teacherRoute(pathname: string, verified: boolean): TeacherRoute | null {
  const course = pathname.match(/^\/teacher\/courses\/([\w-]+)/)
  const route: TeacherRoute | null = /^\/teacher\/home\/?$/.test(pathname)
    ? { page: 'home' }
    : course
      ? { page: 'course', courseId: course[1] }
      : null
  if (route && !verified) return { page: 'verify' }
  return route
}

// 登入後要回到哪裡。教師端網址要整段保留（含 ?view=bank 這類查詢字串與 #錨點），
// 從書籤或連結進來的老師登入後才會回到原本那頁；其他網址照舊回 /。
// 一次性的 verify_token、reset_token 不能跟著留在網址上，否則重新整理又會回到驗證／重設畫面。
const ONE_TIME_PARAMS = ['verify_token', 'reset_token']

export function pathAfterLogin(pathname: string, search = '', hash = '') {
  if (!teacherRoute(pathname, true)) return '/'
  const params = new URLSearchParams(search)
  for (const name of ONE_TIME_PARAMS) params.delete(name)
  const query = params.toString()
  return pathname + (query ? `?${query}` : '') + hash
}
