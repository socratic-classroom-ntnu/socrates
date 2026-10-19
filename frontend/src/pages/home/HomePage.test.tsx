import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { Route, useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/classroomClient'
import { applyLocale } from '../../i18n'
import { mockApi, renderAt, signedIn } from '../../testing/pageHarness'
import { readableText } from '../auth/testText'
import { HomePage } from './HomePage'

jest.mock('../../api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../api/classroomClient')>('../../api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})

const now = Math.floor(Date.now() / 1000)
const teaching = {
  id: 't-1', name: '科技系統與社會發展 A', teacher_name: 'Fizzy', code: '3CKTGE7Q', code_enabled: true,
  student_count: 35, activity_count: 3, open_activity_count: 1,
}
const highlight = (status: 'open' | 'scheduled' | 'ended', title = '第三週倫理討論') => ({
  id: 'a-1', title, status, question_count: 2, starts_at: now - 60, ends_at: now + 3600,
})
const learning = (extra: Record<string, unknown> = {}) => ({
  id: 'c-1', name: '哲學導論', teacher_name: '王思齊', open_activity_count: 1, highlight: highlight('open'), ...extra,
})

const desktopMatchMedia = window.matchMedia
afterEach(() => { Object.defineProperty(window, 'matchMedia', { configurable: true, value: desktopMatchMedia }) })
function phone() {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: (query: string) => ({
    matches: query.includes('max-width: 767px'), media: query, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true },
  }) })
}

const where = () => screen.getByTestId('where').textContent

function open(lists: { teaching?: unknown[]; learning?: unknown[] }, url = '/', routes: Record<string, unknown> = {}) {
  const calls = mockApi({ 'GET /courses': { teaching: lists.teaching ?? [], learning: lists.learning ?? [] }, ...routes })
  renderAt(url, '/', <HomePage />)
  return calls
}

async function typeCode(value: string, button = '加入課程') {
  fireEvent.change(await screen.findByLabelText('課程代碼'), { target: { value } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: button })) })
}

test('defaults to learn tab when learning courses exist', async () => {
  open({ teaching: [teaching], learning: [learning()] })
  expect(await screen.findByText('哲學導論')).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '我學的課' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^(早安|午安|晚安)，Fizzy$/)
})

test('defaults to teach tab when only teaching', async () => {
  open({ teaching: [teaching] })
  expect(await screen.findByText('科技系統與社會發展 A')).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '我教的課' })).toHaveAttribute('aria-selected', 'true')
})

test('tab is kept in the URL', async () => {
  open({ teaching: [teaching], learning: [learning()] })
  fireEvent.click(await screen.findByRole('tab', { name: '我教的課' }))
  expect(where()).toBe('/?tab=teach')
  expect(await screen.findByText('科技系統與社會發展 A')).toBeInTheDocument()
})

test('no courses shows learn tab with empty state and code form', async () => {
  open({})
  expect(await screen.findByRole('heading', { name: '暫無已加入課程' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '我學的課' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText('加入老師的課程後，將在此處顯示')).toBeInTheDocument()
  expect(screen.getByLabelText('課程代碼')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '掃描' })).toBeNull()
  fireEvent.click(screen.getByRole('tab', { name: '我教的課' }))
  expect(screen.getByRole('heading', { name: '暫無任教課程' })).toBeInTheDocument()
  expect(screen.getByText('建立課程後，將在此處顯示')).toBeInTheDocument()
  expect(screen.queryByText('管理課程與活動請用電腦開啟')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '建立課程' }))
  expect(where()).toBe('/?tab=teach&create=1')
  expect(screen.getByRole('dialog', { name: '建立課程' })).toBeInTheDocument()
})

test('phone learn tab has scan code join row', async () => {
  phone()
  open({})
  expect(await screen.findByRole('link', { name: '掃描' })).toHaveAttribute('href', '/scan')
  expect(screen.getByLabelText('課程代碼')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '加入' })).toBeInTheDocument()
  expect(await screen.findByRole('heading', { name: '暫無已加入課程' })).toBeInTheDocument()
})

test('phone teach tab swaps the row for create course', async () => {
  phone()
  open({}, '/?tab=teach')
  expect(await screen.findByRole('link', { name: '建立課程' })).toHaveAttribute('href', '/teach/create-course')
  expect(screen.queryByLabelText('課程代碼')).toBeNull()
  expect(await screen.findByRole('heading', { name: '暫無任教課程' })).toBeInTheDocument()
  expect(screen.queryByText('管理課程與活動請用電腦開啟')).toBeNull()
})

test('phone teach tab with courses shows the computer hint and plain cards', async () => {
  phone()
  open({ teaching: [teaching] }, '/?tab=teach')
  expect(await screen.findByText('管理課程與活動請用電腦開啟')).toBeInTheDocument()
  const card = screen.getByRole('link', { name: /科技系統與社會發展 A/ })
  expect(card).toHaveAttribute('href', '/teach/courses/t-1')
  expect(card).toHaveTextContent('上課中')
  expect(card).toHaveTextContent('學生 35 人 ・ 活動 3 個')
  expect(screen.queryByText('#3CKTGE7Q')).toBeNull()
  expect(screen.queryByRole('button', { name: /複製/ })).toBeNull()
})

test('phone wrong code shows the error under the row', async () => {
  phone()
  open({}, '/', { 'GET /course-join/preview?code=3CKTGE7X': () => { throw new ApiError(404, 'ENROLL_CODE_NOT_FOUND') } })
  await typeCode('3CKTGE7X', '加入')
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('找不到這個課程代碼')
  expect(alert).toHaveTextContent('請再對照一次老師給的 8 碼課程代碼。如果確定沒打錯，請向老師確認代碼是否有更換。')
  expect(screen.getByLabelText('課程代碼')).toHaveAttribute('aria-invalid', 'true')
  const empty = screen.getByRole('heading', { name: '暫無已加入課程' })
  expect(screen.getByRole('link', { name: '掃描' }).compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(alert.compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('join code normalizes and goes to confirm', async () => {
  const calls = open({}, '/', { 'GET /course-join/preview?code=3CKTGE7Q': { course_id: 'c-9', already_enrolled: false } })
  await typeCode(' 3cktge7q ')
  expect(calls.some(call => call.key === 'GET /course-join/preview?code=3CKTGE7Q')).toBe(true)
  await waitFor(() => expect(where()).toBe('/join?code=3CKTGE7Q'))
})

test('already enrolled code goes straight to course page', async () => {
  open({}, '/', { 'GET /course-join/preview?code=3CKTGE7Q': { course_id: 'c-9', already_enrolled: true } })
  await typeCode('3CKTGE7Q')
  await waitFor(() => expect(where()).toBe('/learn/courses/c-9'))
})

test('wrong code shows inline error without navigating', async () => {
  open({}, '/', { 'GET /course-join/preview?code=ZZZZZZZZ': () => { throw new ApiError(404, 'ENROLL_CODE_NOT_FOUND') } })
  await typeCode('zzzzzzzz')
  expect(await screen.findByRole('alert')).toHaveTextContent('找不到這個課程代碼')
  expect(where()).toBe('/')
  fireEvent.change(screen.getByLabelText('課程代碼'), { target: { value: 'ABC' } })
  expect(screen.queryByRole('alert')).toBeNull()
})

test('rate limit is explained', async () => {
  open({}, '/', { 'GET /course-join/preview?code=ZZZZZZZZ': () => { throw new ApiError(429, 'RATE_LIMITED') } })
  await typeCode('ZZZZZZZZ')
  expect(await screen.findByRole('alert')).toHaveTextContent('操作太頻繁，請稍候再試。')
})

test('teaching card shows counts and code', async () => {
  const writeText = jest.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  open({ teaching: [teaching] }, '/?tab=teach')
  const link = await screen.findByRole('link', { name: '科技系統與社會發展 A' })
  expect(link).toHaveAttribute('href', '/teach/courses/t-1')
  const card = link.closest('article') as HTMLElement
  expect(card).toHaveTextContent('上課中')
  expect(card.textContent).not.toMatch(/18|對話中/)
  expect(card).toHaveTextContent('學生 35 人')
  expect(card).toHaveTextContent('活動 3 個')
  expect(within(card).getByText('#3CKTGE7Q')).toBeInTheDocument()
  await act(async () => { fireEvent.click(within(card).getByRole('button', { name: '複製課程代碼' })) })
  expect(writeText).toHaveBeenCalledWith('3CKTGE7Q')
  expect(where()).toBe('/?tab=teach')
})

test('teaching card hides disabled code', async () => {
  open({ teaching: [{ ...teaching, code_enabled: false, open_activity_count: 0 }] }, '/?tab=teach')
  const card = (await screen.findByRole('link', { name: '科技系統與社會發展 A' })).closest('article') as HTMLElement
  expect(within(card).queryByText('#3CKTGE7Q')).toBeNull()
  expect(card).not.toHaveTextContent('上課中')
})

test('desktop learning card is a whole-card link and keeps the start button', async () => {
  open({ learning: [learning()] })
  const card = await screen.findByRole('link', { name: '哲學導論' })
  expect(card).toHaveAttribute('href', '/learn/courses/c-1')
  // The course name stretches over the whole card (CSS ::after); 開始 stays on top of it.
  expect(card).toHaveClass('course-card__stretch')
  const article = card.closest('article') as HTMLElement
  expect(within(article).getByRole('link', { name: /開始/ })).toHaveAttribute('href', expect.stringMatching(/^\/learn\/activities\//))
})

test('learning card shows highlight by status', async () => {
  open({ learning: [
    learning(),
    learning({ id: 'c-2', name: '排程課', open_activity_count: 0, highlight: highlight('scheduled', '器官該分給誰？') }),
    learning({ id: 'c-3', name: '結束課', open_activity_count: 0, highlight: highlight('ended', 'AI 作品能參賽嗎？') }),
    learning({ id: 'c-4', name: '空課', open_activity_count: 0, highlight: null }),
    learning({ id: 'c-5', name: '兩個進行中', open_activity_count: 2 }),
  ] })
  const card = async (name: string) => (await screen.findByRole('link', { name })).closest('article') as HTMLElement
  expect(await card('哲學導論')).toHaveTextContent('進行中')
  expect(await card('哲學導論')).toHaveTextContent('第三週倫理討論')
  expect(await card('哲學導論')).toHaveTextContent('2 題 ・ 開放到')
  expect(await card('排程課')).toHaveTextContent('下一個：器官該分給誰？')
  expect(await card('排程課')).toHaveTextContent('開放')
  expect(await card('排程課')).toHaveTextContent('沒有進行中的活動')
  expect(await card('結束課')).toHaveTextContent('上次：AI 作品能參賽嗎？')
  expect(await card('結束課')).toHaveTextContent('結束')
  expect(await card('空課')).toHaveTextContent('老師還沒有開放活動')
  expect(await card('兩個進行中')).toHaveTextContent('進行中 2')
  expect(document.body).not.toHaveTextContent(/繼續對話|察看我的想法/)
})

test('desktop open highlight has a start button', async () => {
  open({ learning: [learning(), learning({ id: 'c-2', name: '排程課', open_activity_count: 0, highlight: highlight('scheduled') }), learning({ id: 'c-4', name: '空課', highlight: null })] })
  const link = await screen.findByRole('link', { name: '哲學導論' })
  expect(link).toHaveAttribute('href', '/learn/courses/c-1')
  const card = link.closest('article') as HTMLElement
  expect(within(card).getByRole('link', { name: /開始/ })).toHaveAttribute('href', '/learn/activities/a-1')
  for (const name of ['排程課', '空課']) {
    const other = (await screen.findByRole('link', { name })).closest('article') as HTMLElement
    expect(within(other).queryByRole('link', { name: /開始/ })).toBeNull()
    expect(within(other).queryByRole('button')).toBeNull()
  }
})

test('phone learning cards are whole-card links without buttons', async () => {
  phone()
  open({ learning: [learning()] })
  const card = await screen.findByRole('link', { name: /哲學導論/ })
  expect(card).toHaveAttribute('href', '/learn/courses/c-1')
  expect(card).toHaveTextContent('第三週倫理討論')
  expect(within(card).queryByRole('button')).toBeNull()
  expect(screen.queryByRole('link', { name: /開始/ })).toBeNull()
})

test('create=1 opens the create-course drawer and closing removes it', async () => {
  open({ teaching: [teaching] }, '/?tab=teach&create=1')
  const dialog = await screen.findByRole('dialog', { name: '建立課程' })
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(where()).toBe('/?tab=teach')
})

test('scan goes to placeholder', async () => {
  phone()
  open({})
  fireEvent.click(await screen.findByRole('link', { name: '掃描' }))
  expect(where()).toBe('/scan')
})

test('es locale renders without Chinese', async () => {
  await applyLocale('es')
  mockApi({ 'GET /auth/me': { ...signedIn, locale: 'es' }, 'GET /courses': { teaching: [{ ...teaching, name: 'Ética' }], learning: [] } })
  renderAt('/', '/', <HomePage />)
  expect(await screen.findByRole('tab', { name: 'Mis cursos' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Mis clases' }))
  expect(await screen.findByText('Ética')).toBeInTheDocument()
  expect(readableText(document.body)).not.toMatch(/[\u3400-\u9fff\u3000-\u303f\u30fb\uff00-\uffef]/)
})

test('es phone card has no fullwidth punctuation', async () => {
  phone()
  await applyLocale('es')
  mockApi({ 'GET /auth/me': { ...signedIn, locale: 'es' }, 'GET /courses': { teaching: [{ ...teaching, name: 'Ética' }], learning: [] } })
  renderAt('/?tab=teach', '/', <HomePage />)
  expect(await screen.findByText('Ética')).toBeInTheDocument()
  expect(readableText(document.body)).toContain('35 estudiantes')
  expect(readableText(document.body)).not.toMatch(/[\u3000-\u303f\u30fb\uff00-\uffef]/)
})

// ---- Review 修正 Task 14 ----

test('phone create=1 shows S4m instead of the drawer', async () => {
  phone()
  open({}, '/?tab=teach&create=1')
  await waitFor(() => expect(where()).toBe('/teach/create-course'))
  expect(screen.queryByRole('dialog')).toBeNull()
})

function GoBack() {
  const navigate = useNavigate()
  return <button onClick={() => navigate(-1)}>上一頁</button>
}

test('back after creating does not reopen the drawer', async () => {
  mockApi({ 'GET /courses': { teaching: [], learning: [] }, 'POST /courses': { id: 'c-1' } })
  renderAt('/?tab=teach&create=1', '/', <HomePage />, <Route path="/teach/courses/:courseId" element={<GoBack />} />)
  fireEvent.change(await screen.findByLabelText(/課程名稱/), { target: { value: '科技倫理' } })
  await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '建立課程' })) })
  await waitFor(() => expect(where()).toBe('/teach/courses/c-1'))
  fireEvent.click(screen.getByRole('button', { name: '上一頁' }))
  await waitFor(() => expect(where()).toBe('/?tab=teach'))
  expect(screen.queryByRole('dialog')).toBeNull()
})
