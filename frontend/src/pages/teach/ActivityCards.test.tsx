import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { ApiError } from '../../api/classroomClient'
import { applyLocale } from '../../i18n'
import { formatDateTime } from '../../i18n/format'
import { mockApi, renderAt, signedIn } from '../../testing/pageHarness'
import { ActivityCards } from './ActivityCards'

jest.mock('../../api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../api/classroomClient')>('../../api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})
jest.mock('qrcode', () => ({ toDataURL: jest.fn(async (value: string) => 'data:' + value) }))

const now = Math.floor(Date.now() / 1000)
type Card = {
  id: string; title: string; status: 'draft' | 'scheduled' | 'open' | 'ended'; locked: boolean
  has_unpublished_changes: boolean; question_count: number; starts_at: number | null; ends_at: number | null
  available_actions: string[]
}
function card(id: string, status: Card['status'], extra: Partial<Card> = {}): Card {
  const actions: Record<Card['status'], string[]> = {
    draft: ['update', 'publish', 'copy', 'delete'],
    scheduled: ['update', 'update_details', 'publish', 'start_now', 'end_now', 'copy', 'delete'],
    open: ['update', 'update_details', 'publish', 'end_now', 'copy', 'delete'],
    ended: ['copy', 'delete'],
  }
  const times: Record<Card['status'], [number | null, number]> = {
    draft: [null, now + 86400], scheduled: [now + 3600, now + 7200], open: [now - 60, now + 3600], ended: [now - 7200, now - 60],
  }
  return {
    id, title: `活動${id}`, status, locked: false, has_unpublished_changes: false, question_count: 2,
    starts_at: times[status][0], ends_at: times[status][1], available_actions: actions[status], ...extra,
  }
}

const four = [card('open', 'open'), card('sched', 'scheduled'), card('draft', 'draft'), card('ended', 'ended')]
const where = () => screen.getByTestId('where').textContent
// Intl 的日期裡有不換行空白；jest-dom 會把元素文字的空白正規化，期望值也要一樣
const at = (seconds: number | null, style: Parameters<typeof formatDateTime>[2]) => formatDateTime(seconds as number, 'zh-Hant', style).replace(/\s+/g, ' ')
const listKey = 'GET /courses/c-1/activities?role=teacher'

function open(items: Card[] | (() => Card[]), routes: Record<string, unknown> = {}, url = '/teach/courses/c-1') {
  const calls = mockApi({ [listKey]: () => ({ role: 'teacher', items: typeof items === 'function' ? items() : items }), ...routes })
  renderAt(url, '/teach/courses/:courseId', <ActivityCards courseId="c-1" canCreate />)
  return calls
}

async function menuOf(title: string) {
  const trigger = await screen.findByRole('button', { name: `「${title}」的更多動作` })
  await act(async () => { fireEvent.click(trigger) })
  return screen.getByRole('menu', { name: `「${title}」的更多動作` })
}

const names = (menu: HTMLElement) => within(menu).getAllByRole('menuitem').map(item => item.textContent)

test.each([
  ['open', card('a', 'open'), ['投影活動 QR', '統計分析', '編輯', '複製成新活動', '提早結束', '刪除活動']],
  ['scheduled', card('a', 'scheduled'), ['投影活動 QR', '編輯', '取消排程', '複製成新活動', '刪除活動']],
  ['draft', card('a', 'draft'), ['編輯', '發布', '複製成新活動', '刪除活動']],
  ['ended', card('a', 'ended'), ['統計分析', '複製成新活動', '刪除活動']],
  ['open and locked', card('a', 'open', { locked: true, available_actions: ['update_details', 'end_now', 'copy', 'delete'] }),
    ['投影活動 QR', '統計分析', '編輯', '複製成新活動', '提早結束', '刪除活動']],
  ['open without copy', card('a', 'open', { available_actions: ['update', 'end_now', 'delete'] }),
    ['投影活動 QR', '統計分析', '編輯', '提早結束', '刪除活動']],
])('menu entries follow status and available_actions: %s', async (_, item, expected) => {
  open([item])
  expect(names(await menuOf('活動a'))).toEqual(expected)
})

test('start activity posts start_now and refreshes', async () => {
  const calls = open([card('a', 'scheduled')], { 'POST /activities/a/start_now': {} })
  const start = await screen.findByRole('button', { name: '開始活動' })
  await act(async () => { fireEvent.click(start) })
  expect(calls.some(call => call.key === 'POST /activities/a/start_now')).toBe(true)
  await waitFor(() => expect(calls.filter(call => call.key === listKey)).toHaveLength(2))
})

test('only scheduled cards with start_now show the start button', async () => {
  open([card('a', 'scheduled', { available_actions: ['end_now', 'copy', 'delete'] }), card('b', 'open'), card('c', 'draft')])
  await screen.findByText('活動a')
  expect(screen.queryByRole('button', { name: '開始活動' })).toBeNull()
})

test('stale action refreshes and explains', async () => {
  const calls = open([card('a', 'scheduled')], {
    'POST /activities/a/start_now': () => { throw new ApiError(409, 'ACTIVITY_ACTION_UNAVAILABLE') },
  })
  const start = await screen.findByRole('button', { name: '開始活動' })
  await act(async () => { fireEvent.click(start) })
  expect(await screen.findByRole('alert')).toHaveTextContent('活動狀態已經改變，已重新整理')
  expect(calls.filter(call => call.key === listKey)).toHaveLength(2)
})

test('end early asks first', async () => {
  const calls = open([card('a', 'open')], { 'POST /activities/a/end_now': {} })
  fireEvent.click(within(await menuOf('活動a')).getByRole('menuitem', { name: '提早結束' }))
  const dialog = screen.getByRole('dialog', { name: '提早結束活動' })
  expect(dialog).toHaveTextContent('確定要提早結束「活動a」嗎？結束後學生不能再開始。')
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
  expect(calls.some(call => call.key === 'POST /activities/a/end_now')).toBe(false)

  fireEvent.click(within(await menuOf('活動a')).getByRole('menuitem', { name: '提早結束' }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '確認結束' })) })
  expect(calls.some(call => call.key === 'POST /activities/a/end_now')).toBe(true)
})

test('delete asks for confirmation then removes the card', async () => {
  let items = [card('a', 'ended')]
  const calls = open(() => items, { 'DELETE /activities/a': () => { items = []; return null } })
  fireEvent.click(within(await menuOf('活動a')).getByRole('menuitem', { name: '刪除活動' }))
  const dialog = screen.getByRole('dialog', { name: '刪除活動' })
  expect(dialog).toHaveTextContent('確定要刪除活動「活動a」嗎？')
  expect(dialog).toHaveTextContent('刪除後，這個活動將不再顯示，學生也無法進入。目前無法從介面復原。')
  expect(dialog.textContent).not.toMatch(/\d/)
  expect(dialog.textContent).not.toContain('永久移除')
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
  expect(calls.some(call => call.key === 'DELETE /activities/a')).toBe(false)

  fireEvent.click(within(await menuOf('活動a')).getByRole('menuitem', { name: '刪除活動' }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '確認刪除' })) })
  expect(calls.some(call => call.key === 'DELETE /activities/a')).toBe(true)
  await waitFor(() => expect(screen.queryByText('活動a')).toBeNull())
})

test('copy opens editor of the new draft', async () => {
  open([card('a', 'ended')], { 'POST /activities/a/copy': { id: 'a-2' } })
  const menu = await menuOf('活動a')
  await act(async () => { fireEvent.click(within(menu).getByRole('menuitem', { name: '複製成新活動' })) })
  await waitFor(() => expect(where()).toBe('/teach/activities/a-2/edit'))
  expect(JSON.parse(screen.getByTestId('where').dataset.state ?? '{}')).toEqual({ copiedFrom: '活動a' })
})

test('publish error shows translated message', async () => {
  open([card('a', 'draft')], {
    'POST /activities/a/publish': () => { throw new ApiError(422, 'ACTIVITY_TIME_INVALID') },
  })
  const menu = await menuOf('活動a')
  await act(async () => { fireEvent.click(within(menu).getByRole('menuitem', { name: '發布' })) })
  expect(await screen.findByRole('alert')).toHaveTextContent('結束時間已經過了，請先編輯活動')
})

test('edit goes to the editor', async () => {
  open([card('a', 'draft')])
  const menu = await menuOf('活動a')
  await act(async () => { fireEvent.click(within(menu).getByRole('menuitem', { name: '編輯' })) })
  expect(where()).toBe('/teach/activities/a/edit')
})

test('filter chips count and filter', async () => {
  open(four)
  const chips = await screen.findByRole('group', { name: '篩選活動' })
  expect(within(chips).getAllByRole('button').map(button => button.textContent)).toEqual(['全部 4', '進行中 1', '未開始 2', '已結束 1'])
  fireEvent.click(within(chips).getByRole('button', { name: '未開始 2' }))
  expect(where()).toBe('/teach/courses/c-1?filter=upcoming')
  expect(within(chips).getByRole('button', { name: '未開始 2' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('活動sched')).toBeInTheDocument()
  expect(screen.getByText('活動draft')).toBeInTheDocument()
  expect(screen.queryByText('活動open')).toBeNull()
  expect(screen.queryByText('活動ended')).toBeNull()
  expect(screen.getByRole('link', { name: '新增活動' })).toHaveAttribute('href', '/teach/courses/c-1/activities/new')
})

test('card click opens activity page but menu click does not', async () => {
  open([card('a', 'open')])
  await menuOf('活動a')
  expect(where()).toBe('/teach/courses/c-1')
  fireEvent.click(screen.getByRole('link', { name: '活動a' }))
  expect(where()).toBe('/teach/activities/a')
})

test('open and scheduled activity QR open invite dialog with activity url', async () => {
  open([card('a', 'open'), card('b', 'scheduled')])
  for (const id of ['a', 'b']) {
    const menu = await menuOf('活動' + id)
  await act(async () => { fireEvent.click(within(menu).getByRole('menuitem', { name: '投影活動 QR' })) })
    const dialog = screen.getByRole('dialog', { name: `邀請學生參加「活動${id}」` })
    expect(await within(dialog).findByRole('img', { name: /QR code/ })).toHaveAttribute('src', `data:http://localhost/activities/${id}/join`)
    fireEvent.click(within(dialog).getByRole('button', { name: '關閉' }))
  }
})

test('pending changes badge follows backend flag', async () => {
  open([card('a', 'open', { has_unpublished_changes: true }), card('b', 'draft', { has_unpublished_changes: false })])
  await screen.findByText('活動a')
  expect(screen.getAllByText('有未發布的變更')).toHaveLength(1)
  expect(screen.getByText('活動a').closest('article')).toHaveTextContent('有未發布的變更')
})

test('draft card shows planned end and students cannot see it', async () => {
  const draft = card('a', 'draft')
  open([draft])
  const article = (await screen.findByText('活動a')).closest('article') as HTMLElement
  expect(article).toHaveTextContent(`2 題 ・ 預定到 ${at(draft.ends_at, 'dateTime')}`)
  expect(article).toHaveTextContent('學生看不到')
  expect(within(article).getByText('草稿')).toBeInTheDocument()
})

test('scheduled, open and ended cards describe their window', async () => {
  open(four)
  const text = async (title: string) => (((await screen.findByText(title)).closest('article') as HTMLElement).textContent ?? '').replace(/\s+/g, ' ')
  const [o, s, , e] = four
  expect(await text('活動open')).toContain(`2 題 ・ 開放到 ${at(o.ends_at, 'weekdayDateTime')}`)
  expect(await text('活動sched')).toContain(`${at(s.starts_at, 'weekdayDateTime')} 自動開放 ・ 到 ${at(s.ends_at, 'dateTime')}`)
  expect(await text('活動sched')).toContain('還沒開放')
  expect(await text('活動ended')).toContain(`${at(e.ends_at, 'weekdayDate')} 結束`)
})

test('open card shows started and done from progress', async () => {
  open([card('a', 'open')], {
    'GET /solo/activities/a/progress': {
      summary: { enrolled: 35, started: 18, done: 9, unconfirmed_by_question: [4, 8], attention: 2 },
    },
  })

  const article = (await screen.findByText('活動a')).closest('article') as HTMLElement
  expect(await within(article).findByText('已開始 18／35')).toBeInTheDocument()
  expect(within(article).getByText('完成 9／35')).toBeInTheDocument()
})

test('ended card shows done only', async () => {
  open([card('a', 'ended')], {
    'GET /solo/activities/a/progress': {
      summary: { enrolled: 35, started: 35, done: 32, unconfirmed_by_question: [0, 0], attention: 0 },
    },
  })

  const article = (await screen.findByText('活動a')).closest('article') as HTMLElement
  expect(await within(article).findByText('完成 32／35')).toBeInTheDocument()
  expect(within(article).queryByText(/已開始/)).toBeNull()
  expect(within(article).queryByText(/改變立場/)).toBeNull()
})

test('scheduled and draft cards do not fetch progress', async () => {
  const calls = open([card('scheduled', 'scheduled'), card('draft', 'draft')])

  expect(await screen.findByText('還沒開放')).toBeInTheDocument()
  expect(screen.getByText('學生看不到')).toBeInTheDocument()
  expect(calls.some(call => call.key.endsWith('/progress'))).toBe(false)
})

test('progress failure leaves the card usable', async () => {
  open([card('a', 'open')], {
    'GET /solo/activities/a/progress': () => { throw new ApiError(500, 'SERVER_ERROR') },
  })

  expect(await screen.findByRole('link', { name: '活動a' })).toHaveAttribute('href', '/teach/activities/a')
  expect(screen.getByRole('button', { name: '「活動a」的更多動作' })).toBeEnabled()
  expect(screen.queryByRole('alert')).toBeNull()
})

test('open activity card uses the muted green border', async () => {
  const stylesheet = document.createElement('style')
  stylesheet.textContent = readFileSync(`${process.cwd()}/src/styles/teach.css`, 'utf8')
  document.head.append(stylesheet)
  open([card('a', 'open')])

  const article = (await screen.findByText('活動a')).closest('article') as HTMLElement
  expect(getComputedStyle(article).borderTopColor).toBe('#b7cbc1')
  stylesheet.remove()
})

test('no activities shows the T2 empty state', async () => {
  open([])
  expect(await screen.findByRole('heading', { name: '這門課還沒有活動' })).toBeInTheDocument()
})

// ---- Review 修正 Task 14 ----

test('double click posts start_now once', async () => {
  let finish: (value: unknown) => void = () => {}
  const calls = open([card('a', 'scheduled')], { 'POST /activities/a/start_now': () => new Promise(resolve => { finish = resolve }) })
  const start = await screen.findByRole('button', { name: '開始活動' })
  await act(async () => { fireEvent.click(start); fireEvent.click(start) })
  expect(start).toBeDisabled()
  expect(screen.getByRole('button', { name: '「活動a」的更多動作' })).toBeDisabled()
  await act(async () => { finish({}) })
  expect(calls.filter(call => call.key === 'POST /activities/a/start_now')).toHaveLength(1)
})

test('empty filter explains itself', async () => {
  open([card('a', 'open')], {}, '/teach/courses/c-1?filter=ended')
  expect(await screen.findByText('沒有符合的活動')).toBeInTheDocument()
})

test('ended cards show the weekday', async () => {
  const ended = card('e', 'ended')
  open([ended])
  const article = (await screen.findByText('活動e')).closest('article') as HTMLElement
  expect(article.textContent?.replace(/\s+/g, ' ')).toContain(`${at(ended.ends_at, 'weekdayDate')} 結束`)
})

test('english counts one question in the singular', async () => {
  await applyLocale('en')
  open([card('one', 'draft', { question_count: 1 }), card('two', 'draft', { question_count: 2 })], { 'GET /auth/me': { ...signedIn, locale: 'en' } })
  expect(await screen.findByText(/^1 question ·/)).toBeInTheDocument()
  expect(screen.getByText(/^2 questions ·/)).toBeInTheDocument()
})
