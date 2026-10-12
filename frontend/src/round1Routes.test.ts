import { CLASSROOM_HOME, ROUND1_HOME, isRound1Path } from './round1Routes'

// App.tsx 依網址決定整頁掛哪個 app；Round 1 內部的「首頁」網址必須重新整理後仍回到 Round 1
test('the Round 1 home URL survives a reload while "/" stays the classroom home', () => {
  expect(isRound1Path(ROUND1_HOME)).toBe(true)
  expect(isRound1Path('/history')).toBe(true)
  expect(isRound1Path('/sessions/s1/summary')).toBe(true)
  expect(isRound1Path(CLASSROOM_HOME)).toBe(false)
  expect(isRound1Path('/classrooms/c1')).toBe(false)
  expect(isRound1Path('/round10')).toBe(false)
})
