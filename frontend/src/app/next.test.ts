import { deepLink, safeNext } from './next'

// 登入後回到原網址：路徑、查詢字串、錨點都要留著（教師書籤、活動 QR 都靠這個）
test('deep links keep path, query and hash', () => {
  expect(deepLink('/teacher/home', '?view=bank', '#teacher-content')).toBe('/teacher/home?view=bank#teacher-content')
  expect(deepLink('/activities/a-1/join', '?from=qr', '#confirm')).toBe('/activities/a-1/join?from=qr#confirm')
  expect(deepLink('/teacher/courses/c1')).toBe('/teacher/courses/c1')
  expect(deepLink('/teacher/courses/c-1', '', '#lessons')).toBe('/teacher/courses/c-1#lessons')
  expect(deepLink('/teacher/home', '?')).toBe('/teacher/home')
  // 舊規則是「非教師頁登入後一律回首頁」；活動 QR 上線後，所有深連結都要回到原網址
  expect(deepLink('/classrooms/r-1', '?mode=student')).toBe('/classrooms/r-1?mode=student')
})

// 一次性的 verify_token、reset_token 不能跟著留下，否則重新整理又回到驗證／重設畫面
test('deep links drop one-time tokens but keep other queries', () => {
  expect(deepLink('/teacher/home', '?view=bank&verify_token=x&reset_token=y')).toBe('/teacher/home?view=bank')
  expect(deepLink('/', '?verify_token=x')).toBe('/')
})

test('next accepts only same-site paths', () => {
  expect(safeNext('/teacher/home?view=bank#teacher-content')).toBe('/teacher/home?view=bank#teacher-content')
  expect(safeNext(null)).toBe('/')
  expect(safeNext('')).toBe('/')
  expect(safeNext('https://evil.example')).toBe('/')
  expect(safeNext('//evil.example/path')).toBe('/')
  expect(safeNext('/\\evil.example')).toBe('/')
  expect(safeNext('javascript:alert(1)')).toBe('/')
  expect(safeNext('teacher/home')).toBe('/')
  expect(safeNext('/%ZZ')).toBe('/')
  expect(safeNext('/\uFFFD')).toBe('/')
})

test('next never sends the user back to the login or verify screens', () => {
  expect(safeNext('/login?next=/x')).toBe('/')
  expect(safeNext('/verify?token=t')).toBe('/')
})
