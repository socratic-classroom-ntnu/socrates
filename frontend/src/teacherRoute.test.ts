import { pathAfterLogin, teacherRoute } from './teacherRoute'

test('maps the teacher pages for a verified account', () => {
  expect(teacherRoute('/teacher/home', true)).toEqual({ page: 'home' })
  expect(teacherRoute('/teacher/home/', true)).toEqual({ page: 'home' })
  expect(teacherRoute('/teacher/courses/c-1', true)).toEqual({ page: 'course', courseId: 'c-1' })
})

// 未驗證帳號打開書籤裡的課程網址，要先看到驗證頁，而不是被 403 擋住的編輯畫面
test('sends an unverified account to email verification on every teacher page', () => {
  expect(teacherRoute('/teacher/home', false)).toEqual({ page: 'verify' })
  expect(teacherRoute('/teacher/courses/c-1', false)).toEqual({ page: 'verify' })
})

test('leaves other paths to the rest of the app', () => {
  expect(teacherRoute('/', false)).toBeNull()
  expect(teacherRoute('/teacher', true)).toBeNull()
  expect(teacherRoute('/classrooms/r-1', true)).toBeNull()
})

// 書籤裡的教師端網址，登入後要回到原本那頁，不能被換成學生首頁
test('keeps teacher pages across login and sends everything else home', () => {
  expect(pathAfterLogin('/teacher/home')).toBe('/teacher/home')
  expect(pathAfterLogin('/teacher/courses/c-1')).toBe('/teacher/courses/c-1')
  expect(pathAfterLogin('/')).toBe('/')
  expect(pathAfterLogin('/classrooms/r-1')).toBe('/')
})
