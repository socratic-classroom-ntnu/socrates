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

// 登入後要回到哪裡。教師端網址要保留，從書籤或連結進來的老師登入後才會回到原本那頁；
// 其他網址照舊回 /（順便清掉 verify_token、reset_token）。
export function pathAfterLogin(pathname: string) {
  return teacherRoute(pathname, true) ? pathname : '/'
}
