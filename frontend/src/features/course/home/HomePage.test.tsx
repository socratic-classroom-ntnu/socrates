import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { Route, useNavigate } from 'react-router-dom'
import { ApiError } from '../../../contract/classroomClient'
import { applyLocale } from '../../../i18n'
import { mockApi, renderAt, signedIn, signedInTeacher } from '../../../testing/pageHarness'
import { readableText } from '../../auth/testText'
import { HomePage } from './HomePage'

jest.mock('../../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../../contract/classroomClient')>('../../../contract/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})

const now = Math.floor(Date.now() / 1000)
const teaching = {
  id: 't-1', name: '科技系統與社會發展 A', teacher_name: 'Fizzy', code: '3CKTGE7Q', code_enabled: true,
  student_count: 35, activity_count: 3, open_activity_count: 1,
}
const highlight = (status: 'open' | 'scheduled' | 'ended', title = '第三週倫理討論') => ({
  id: 'a-1', title, status, starts_at: now - 60, ends_at: now + 3600,
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

// 帳號只有一個角色（P20、P21）：學生只有學的課＋加入課程，老師只有教的課＋建立課程；沒有分頁，?tab= 一律忽略
test('a student account sees only the courses it learns, with no tabs', async () => {
  open({ teaching: [teaching], learning: [learning()] })
  expect(await screen.findByText('哲學導論')).toBeInTheDocument()
  expect(screen.queryByText('科技系統與社會發展 A')).toBeNull()
  expect(screen.queryByRole('tab')).toBeNull()
  expect(screen.queryByRole('button', { name: '建立課程' })).toBeNull()
  expect(screen.getByLabelText('課程代碼')).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^(早安|午安|晚安)，Fizzy$/)
  // Fizzy 11/16：面板頂端是「我學的課 N 門」標題列（跟老師的「我的課程」一樣），電腦版的加入課程放在這一列右邊
  const panel = screen.getByRole('region', { name: /^我學的課/ })
  expect(within(panel).getByRole('heading', { level: 2, name: '我學的課 1 門' })).toBeInTheDocument()
  expect(panel).toContainElement(screen.getByLabelText('課程代碼'))
  expect(panel).toContainElement(screen.getByText('哲學導論'))
})

test('a teacher account sees only the courses it teaches, with create course', async () => {
  open({ teaching: [teaching], learning: [learning()] }, '/', { 'GET /auth/me': signedInTeacher })
  expect(await screen.findByText('科技系統與社會發展 A')).toBeInTheDocument()
  expect(screen.queryByText('哲學導論')).toBeNull()
  expect(screen.queryByRole('tab')).toBeNull()
  expect(screen.queryByLabelText('課程代碼')).toBeNull()
  expect(screen.getByRole('heading', { name: '我的課程 1 門' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '建立課程' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^(早安|午安|晚安)，Wang$/)
})

test.each(['/?tab=teach', '/?tab=learn'])('%s is ignored for both roles', async (url) => {
  open({ teaching: [teaching], learning: [learning()] }, url)
  expect(await screen.findByText('哲學導論')).toBeInTheDocument()
  expect(screen.queryByText('科技系統與社會發展 A')).toBeNull()
  expect(where()).toBe(url)
})

test('a teacher account ignores ?tab=learn', async () => {
  open({ teaching: [teaching], learning: [learning()] }, '/?tab=learn', { 'GET /auth/me': signedInTeacher })
  expect(await screen.findByText('科技系統與社會發展 A')).toBeInTheDocument()
  expect(screen.queryByText('哲學導論')).toBeNull()
})

test('a student with no courses sees the empty state and the code form', async () => {
  open({})
  expect(await screen.findByRole('heading', { name: '還沒有加入任何課程' })).toBeInTheDocument()
  expect(screen.getByText('輸入老師給的代碼加入課程。')).toBeInTheDocument()
  // 畫布 MyCoursesEmpty：也可以先到我的對話練習
  expect(screen.getByText('也可以先到「我的對話」練習。')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /去我的對話/ })).toHaveAttribute('href', '/my-dialogues')
  expect(screen.getByLabelText('課程代碼')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '掃描' })).toBeNull()
  // 沒有課時標題不帶數量，加入課程照樣在標題列
  const panel = screen.getByRole('region', { name: /^我學的課/ })
  expect(within(panel).getByRole('heading', { level: 2, name: '我學的課' })).toBeInTheDocument()
  expect(panel).toContainElement(screen.getByLabelText('課程代碼'))
})

test('a teacher with no courses sees the first-course steps and creates one', async () => {
  open({}, '/', { 'GET /auth/me': signedInTeacher })
  expect(await screen.findByRole('heading', { name: '還沒有任何課程' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '我的課程' })).toBeInTheDocument()
  const steps = screen.getByRole('list', { name: '開始的三個步驟' })
  expect(within(steps).getAllByRole('listitem')).toHaveLength(3)
  // 畫布 H2t：建立第一門課是大按鈕（頁面自己的 class 調尺寸，共用 Button 不加尺寸）
  expect(screen.getByRole('button', { name: '建立第一門課' })).toHaveClass('home__create-first')
  fireEvent.click(screen.getByRole('button', { name: '建立第一門課' }))
  expect(where()).toBe('/?create=1')
  expect(screen.getByRole('dialog', { name: '建立課程' })).toBeInTheDocument()
})

test('a student account ignores ?create=1', async () => {
  open({ learning: [learning()] }, '/?create=1')
  expect(await screen.findByText('哲學導論')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('phone student home has the scan and code join row', async () => {
  phone()
  open({})
  expect(await screen.findByRole('button', { name: '掃描' })).toBeInTheDocument()
  expect(screen.getByLabelText('課程代碼')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '加入' })).toBeInTheDocument()
  expect(await screen.findByRole('heading', { name: '還沒有加入任何課程' })).toBeInTheDocument()
  expect(screen.getByText('掃描 QR 或輸入代碼加入課程。')).toBeInTheDocument()
})

test('phone student home keeps the join row under the greeting and titles the panel', async () => {
  phone()
  open({ learning: [learning(), learning({ id: 'c-2', name: '科技倫理' })] })
  const panel = await screen.findByRole('region', { name: /^我學的課/ })
  expect(await within(panel).findByRole('heading', { level: 2, name: '我學的課 2 門' })).toBeInTheDocument()
  // 畫布 M2m：掃描＋代碼列仍在問候語下面，不進面板
  expect(panel).not.toContainElement(screen.getByLabelText('課程代碼'))
})

test('phone teacher home asks for a computer and loads no courses', async () => {
  phone()
  const calls = open({ teaching: [teaching] }, '/', { 'GET /auth/me': signedInTeacher })
  expect(await screen.findByRole('heading', { name: '老師的功能請用電腦開啟' })).toBeInTheDocument()
  expect(screen.getByText('建立課程、出題和查看學生的想法，目前只能在電腦上使用。請用電腦登入同一個帳號。')).toBeInTheDocument()
  expect(screen.getByText('目前登入：Wang')).toBeInTheDocument()
  expect(screen.queryByText('科技系統與社會發展 A')).toBeNull()
  expect(calls.some(call => call.key === 'GET /courses')).toBe(false)
})

test('phone wrong code shows the error under the row', async () => {
  phone()
  open({}, '/', { 'GET /course-join/preview?code=3CKTGE7X': () => { throw new ApiError(404, 'ENROLL_CODE_NOT_FOUND') } })
  await typeCode('3CKTGE7X', '加入')
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('找不到這個課程代碼')
  expect(alert).toHaveTextContent('請再對照一次老師給的 8 碼課程代碼。如果確定沒打錯，請向老師確認代碼是否有更換。')
  expect(screen.getByLabelText('課程代碼')).toHaveAttribute('aria-invalid', 'true')
  const empty = screen.getByRole('heading', { name: '還沒有加入任何課程' })
  expect(screen.getByRole('button', { name: '掃描' }).compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(alert.compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('join code normalizes and goes to confirm', async () => {
  const calls = open({}, '/', { 'GET /course-join/preview?code=3CKTGE7Q': { course_id: 'c-9', already_enrolled: false } })
  await typeCode(' 3cktge7q ')
  expect(calls.some(call => call.key === 'GET /course-join/preview?code=3CKTGE7Q')).toBe(true)
  await waitFor(() => expect(where()).toBe('/join?code=3CKTGE7Q'))
})

test('the preview is handed to the confirm page so it is not fetched twice', async () => {
  open({}, '/', { 'GET /course-join/preview?code=3CKTGE7Q': { course_id: 'c-9', already_enrolled: false, course_name: '哲學導論' } })
  await typeCode('3cktge7q')
  await waitFor(() => expect(where()).toBe('/join?code=3CKTGE7Q'))
  expect(JSON.parse(screen.getByTestId('where').dataset.state!)).toEqual({
    preview: { course_id: 'c-9', already_enrolled: false, course_name: '哲學導論', code: '3CKTGE7Q' },
  })
})

test('a blank code does not look anything up', async () => {
  const calls = open({})
  await typeCode('   ')
  expect(calls.some(call => call.key.startsWith('GET /course-join/preview'))).toBe(false)
  expect(where()).toBe('/')
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
  open({ teaching: [teaching] }, '/', { 'GET /auth/me': signedInTeacher })
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
  expect(where()).toBe('/')
})

test('teaching card hides disabled code', async () => {
  open({ teaching: [{ ...teaching, code_enabled: false, open_activity_count: 0 }] }, '/', { 'GET /auth/me': signedInTeacher })
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
  expect(await card('哲學導論')).toHaveTextContent('開放到')
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
    // 畫布 M2：沒有進行中活動的卡片右下是「進入課程 →」
    expect(within(other).getByRole('link', { name: '進入課程' })).toHaveAttribute('href', expect.stringMatching(/^\/learn\/courses\/c-/))
  }
  // 進行中的卡片只有「開始」，不重複「進入課程」
  expect(within(card).queryByRole('link', { name: '進入課程' })).toBeNull()
})

test('phone learning cards are whole-card links without buttons', async () => {
  phone()
  open({ learning: [learning()] })
  const card = await screen.findByRole('link', { name: /哲學導論/ })
  expect(card).toHaveAttribute('href', '/learn/courses/c-1')
  expect(card).toHaveTextContent('第三週倫理討論')
  expect(within(card).queryByRole('button')).toBeNull()
  expect(screen.queryByRole('link', { name: /開始/ })).toBeNull()
  expect(screen.queryByRole('link', { name: '進入課程' })).toBeNull()
})

test('create=1 opens the create-course drawer for a teacher and closing removes it', async () => {
  open({ teaching: [teaching] }, '/?tab=teach&create=1', { 'GET /auth/me': signedInTeacher })
  const dialog = await screen.findByRole('dialog', { name: '建立課程' })
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(where()).toBe('/?tab=teach')
})

test('scan with camera already allowed goes to the scan page', async () => {
  phone()
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: 'granted' }) } })
  try {
    open({})
    const scan = await screen.findByRole('button', { name: '掃描' })
    await act(async () => { fireEvent.click(scan) })
    expect(where()).toBe('/scan')
  } finally {
    delete (navigator as { permissions?: unknown }).permissions
  }
})

test('es locale renders without Chinese', async () => {
  await applyLocale('es')
  mockApi({ 'GET /auth/me': { ...signedInTeacher, locale: 'es' }, 'GET /courses': { teaching: [{ ...teaching, name: 'Ética' }], learning: [] } })
  renderAt('/', '/', <HomePage />)
  expect(await screen.findByText('Ética')).toBeInTheDocument()
  expect(readableText(document.body)).not.toMatch(/[\u3400-\u9fff\u3000-\u303f\u30fb\uff00-\uffef]/)
})

test('es phone card has no fullwidth punctuation', async () => {
  phone()
  await applyLocale('es')
  mockApi({ 'GET /auth/me': { ...signedIn, locale: 'es' }, 'GET /courses': { teaching: [], learning: [learning({ name: 'Ética' })] } })
  renderAt('/', '/', <HomePage />)
  expect(await screen.findByText('Ética')).toBeInTheDocument()
  expect(readableText(document.body)).not.toMatch(/[\u3000-\u303f\u30fb\uff00-\uffef]/)
})


test('phone create=1 shows S4m instead of the drawer', async () => {
  phone()
  open({}, '/?tab=teach&create=1', { 'GET /auth/me': signedInTeacher })
  await waitFor(() => expect(where()).toBe('/teach/create-course'))
  expect(screen.queryByRole('dialog')).toBeNull()
})

function GoBack() {
  const navigate = useNavigate()
  return <button onClick={() => navigate(-1)}>上一頁</button>
}

test('back after creating does not reopen the drawer', async () => {
  mockApi({ 'GET /auth/me': signedInTeacher, 'GET /courses': { teaching: [], learning: [] }, 'POST /courses': { id: 'c-1' } })
  renderAt('/?tab=teach&create=1', '/', <HomePage />, <Route path="/teach/courses/:courseId" element={<GoBack />} />)
  fireEvent.change(await screen.findByLabelText(/課程名稱/), { target: { value: '科技倫理' } })
  await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '建立課程' })) })
  await waitFor(() => expect(where()).toBe('/teach/courses/c-1'))
  fireEvent.click(screen.getByRole('button', { name: '上一頁' }))
  await waitFor(() => expect(where()).toBe('/?tab=teach'))
  expect(screen.queryByRole('dialog')).toBeNull()
})
