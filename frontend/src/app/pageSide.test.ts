import { pageSide } from './pageSide'

// 依路徑開頭判斷，結尾斜線不影響；表上沒有的都算兩邊都能開（需求 MD「哪些網址算哪一邊」）。
describe('pageSide', () => {
  it.each([
    '/learn',
    '/learn/',
    '/learn/courses/c1',
    '/learn/activities/a1/dialogue',
    '/join',
    '/join/',
    '/activities/a1/join',
    '/activities/a1/join/',
    '/scan',
  ])('%s is a student page', path => {
    expect(pageSide(path)).toBe('student')
  })

  it.each([
    '/teach',
    '/teach/',
    '/teach/courses/c1',
    '/teach/courses/c1/projector',
    '/teach/activities/a1/analysis/ai',
    '/teacher',
    '/teacher/home',
    '/teacher/courses/c1',
  ])('%s is a teacher page', path => {
    expect(pageSide(path)).toBe('teacher')
  })

  it.each([
    '/',
    '/groups',
    '/account',
    '/classrooms/r1',
    '/question-bank',
    '/login',
    '/verify',
    '/guest/register',
    // 只有開頭一樣的字不算
    '/learner',
    '/joined',
    '/teachers',
    '/scanner',
    '/activities/a1',
    '/activities/a1/join-preview',
  ])('%s opens for both', path => {
    expect(pageSide(path)).toBeNull()
  })
})
