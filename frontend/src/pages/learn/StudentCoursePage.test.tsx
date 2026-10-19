import { act, fireEvent, screen, within } from '@testing-library/react'
import { ApiError } from '../../api/classroomClient'
import { applyLocale } from '../../i18n'
import { mockApi, renderAt, signedIn } from '../../testing/pageHarness'
import { readableText } from '../auth/testText'
import { StudentCoursePage } from './StudentCoursePage'

jest.mock('../../api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../api/classroomClient')>('../../api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})

const now = Math.floor(Date.now() / 1000)
const course = { role: 'student', id: 'c-1', name: '哲學導論', teacher_name: '王思齊', intro: '', code: '3CKTGE7Q', display_name: '小美' }
const card = (id: string, status: 'open' | 'scheduled' | 'ended', title: string) => ({
  id, title, status, question_count: 2,
  starts_at: status === 'scheduled' ? now + 3600 : now - 7200,
  ends_at: status === 'ended' ? now - 60 : now + 86400,
})
const items = [
  card('o1', 'open', '第三週倫理討論'), card('o2', 'open', '說謊可以嗎？'),
  card('s1', 'scheduled', '器官該分給誰？'), card('e1', 'ended', 'AI 作品能參賽嗎？'),
]
const where = () => screen.getByTestId('where').textContent

const desktopMatchMedia = window.matchMedia
afterEach(() => { Object.defineProperty(window, 'matchMedia', { configurable: true, value: desktopMatchMedia }) })
function phone() {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: (query: string) => ({
    matches: query.includes('max-width: 767px'), media: query, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true },
  }) })
}

function open(overrides: Record<string, unknown> = {}, list = items, url = '/learn/courses/c-1') {
  mockApi({
    'GET /courses/c-1?role=student': { ...course, ...overrides },
    'GET /courses/c-1/activities?role=student': { role: 'student', items: list },
  })
  renderAt(url, '/learn/courses/:courseId', <StudentCoursePage />)
}

const section = (name: string) => screen.getByRole('region', { name })

test('groups activities into sections in order', async () => {
  open()
  expect(await screen.findByRole('heading', { level: 1, name: '哲學導論' })).toBeInTheDocument()
  expect(screen.getByText('王思齊 老師')).toBeInTheDocument()
  // 「課程 / 課程名」：「課程」回首頁的我學的課
  const path = screen.getByRole('navigation', { name: '課程路徑' })
  expect(within(path).getByRole('link', { name: '課程' })).toHaveAttribute('href', '/?tab=learn')
  expect(path).toHaveTextContent(/^課程\s*\/$/)
  const headings = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
  expect(headings).toEqual(['進行中', '即將開始', '已結束'])
  expect(within(section('進行中')).getByText('第三週倫理討論')).toBeInTheDocument()
  expect(within(section('進行中')).getByText('說謊可以嗎？')).toBeInTheDocument()
  expect(within(section('即將開始')).getByText('器官該分給誰？')).toBeInTheDocument()
  expect(within(section('已結束')).getByText('AI 作品能參賽嗎？')).toBeInTheDocument()
})

test('empty sections are hidden and no activities says so', async () => {
  open({}, [])
  expect(await screen.findByText('老師還沒有開放活動')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
})

test('desktop open card is a whole-card link and keeps the start button', async () => {
  open()
  const start = (await within(await screen.findByRole('region', { name: '進行中' })).findAllByRole('link', { name: /開始/ }))[0]
  expect(start).toHaveAttribute('href', '/learn/activities/o1')
  const article = start.closest('article') as HTMLElement
  // The title link stretches over the whole card (CSS ::after); the button stays on top of it.
  const card = within(article).getByRole('link', { name: '第三週倫理討論' })
  expect(card).toHaveAttribute('href', '/learn/activities/o1')
  expect(card).toHaveClass('learn-card__stretch')
  expect(within(article).getAllByRole('link')).toHaveLength(2)
  expect(article).toHaveTextContent('2 題')
  expect(article).toHaveTextContent('開放到')
})

test('phone open card is a whole-card link without buttons', async () => {
  phone()
  open()
  const link = await screen.findByRole('link', { name: /第三週倫理討論/ })
  expect(link).toHaveAttribute('href', '/learn/activities/o1')
  expect(link).toHaveTextContent('2 題 ・ 開放到')
  expect(screen.queryByRole('link', { name: /^開始/ })).toBeNull()
  expect(screen.queryAllByRole('button').filter(button => button.closest('article'))).toHaveLength(0)
})

test('scheduled and ended cards have no link or button', async () => {
  open()
  for (const name of ['即將開始', '已結束']) {
    const region = await screen.findByRole('region', { name })
    expect(within(region).queryAllByRole('link')).toHaveLength(0)
    expect(within(region).queryAllByRole('button')).toHaveLength(0)
  }
  expect(section('即將開始')).toHaveTextContent('開放')
  expect(section('已結束')).toHaveTextContent('結束')
})

test('filter chips count and filter', async () => {
  open()
  const chips = await screen.findByRole('group', { name: '篩選活動' })
  expect(within(chips).getAllByRole('button').map(button => button.textContent)).toEqual(['全部 4', '進行中 2', '即將開始 1', '已結束 1'])
  fireEvent.click(within(chips).getByRole('button', { name: '即將開始 1' }))
  expect(where()).toBe('/learn/courses/c-1?filter=scheduled')
  expect(screen.queryByRole('region', { name: '進行中' })).toBeNull()
  expect(screen.getByRole('region', { name: '即將開始' })).toBeInTheDocument()
})

test('code box hidden when code is null and copy works when present', async () => {
  const writeText = jest.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  open()
  expect(await screen.findByText('3CKTGE7Q')).toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '複製課程代碼' })) })
  expect(writeText).toHaveBeenCalledWith('3CKTGE7Q')
})

test('no code box when the code is turned off', async () => {
  open({ code: null })
  await screen.findByRole('heading', { level: 1, name: '哲學導論' })
  expect(screen.queryByText('課程代碼')).toBeNull()
})

test('no progress wording in M2', async () => {
  open()
  await screen.findByRole('heading', { level: 1, name: '哲學導論' })
  expect(document.body).not.toHaveTextContent(/已完成|沒有參加|對話中|繼續對話|察看我的想法|已截止/)
})

test('unknown course shows not found', async () => {
  mockApi({
    'GET /courses/c-1?role=student': () => { throw new ApiError(404, 'COURSE_NOT_FOUND') },
    'GET /courses/c-1/activities?role=student': () => { throw new ApiError(404, 'COURSE_NOT_FOUND') },
  })
  renderAt('/learn/courses/c-1', '/learn/courses/:courseId', <StudentCoursePage />)
  expect(await screen.findByRole('heading', { name: '找不到這門課' })).toBeInTheDocument()
})

test('es locale renders without Chinese', async () => {
  await applyLocale('es')
  mockApi({
    'GET /auth/me': { ...signedIn, locale: 'es' },
    'GET /courses/c-1?role=student': { ...course, name: 'Ethics', teacher_name: 'Ana' },
    'GET /courses/c-1/activities?role=student': { role: 'student', items: [card('o1', 'open', 'Trolley'), card('s1', 'scheduled', 'Organs'), card('e1', 'ended', 'Lies')] },
  })
  renderAt('/learn/courses/c-1', '/learn/courses/:courseId', <StudentCoursePage />)
  expect(await screen.findByRole('heading', { level: 1, name: 'Ethics' })).toBeInTheDocument()
  expect(readableText(document.body)).not.toMatch(/[\u3400-\u9fff\u3000-\u303f\u30fb\uff00-\uffef]/)
})

// ---- Review 修正 Task 14 ----

test('empty filter explains itself', async () => {
  open({}, [card('o1', 'open', '第三週倫理討論')], '/learn/courses/c-1?filter=ended')
  expect(await screen.findByText('沒有符合的活動')).toBeInTheDocument()
})
