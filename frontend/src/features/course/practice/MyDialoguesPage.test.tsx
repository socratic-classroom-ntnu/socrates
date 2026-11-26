import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { ApiError } from '../../../contract/classroomClient'
import { mockApi, renderAt, signedIn } from '../../../testing/pageHarness'
import { MyDialoguesPage } from './MyDialoguesPage'

jest.mock('../../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../../contract/classroomClient')>('../../../contract/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})

const BANK = [
  { id: 'llm-school', title: '語言模型與學校學習', body: '請問在 2026 年的現在，我們在學校的學習是不是也要開放使用語言模型？', category: 'tech', recommended: true },
  { id: 'trolley', title: '電車難題', body: '一輛失控的電車正駛向五名工人。你會拉下拉桿嗎？', category: 'life', recommended: true },
  { id: 'lie-to-save-friend', title: '說謊救朋友', body: '你的朋友躲進了你家。你會說謊嗎？', category: 'honesty', recommended: true },
  { id: 'ship-of-theseus', title: '忒修斯之船', body: '全部換完之後，它還是同一艘船嗎？', category: 'self', recommended: true },
]
// 比卡片放得下的還多：第一次進來和訪客只放其中六題
const MANY = Array.from({ length: 10 }, (_, index) => ({
  id: `topic-${index + 1}`, title: `題目 ${index + 1}`, body: `第 ${index + 1} 題的情境。`, category: 'tech', recommended: true,
}))
const NOT_RECOMMENDED = { id: 'not-recommended', title: '不推薦的題目', body: '只在全部題目裡出現。', category: 'self', recommended: false }
const cardTitles = () => screen.getAllByRole('button', { name: /開始對話/ }).map(card => card.querySelector('b')?.textContent ?? '')
// 2026-11-13（五）12:00 台北
const THURSDAY = Date.UTC(2026, 10, 13, 4, 0) / 1000
const dialogue = (extra: Record<string, unknown> = {}) => ({
  activity_id: 'a-1', attempt_id: 't-1', topic_id: 'llm-school', title: '語言模型與學校學習',
  body: '請問在 2026 年的現在，我們在學校的學習是不是也要開放使用語言模型？', category: 'tech',
  status: 'in_progress', created_at: THURSDAY, updated_at: THURSDAY, ...extra,
})
const quota = (used: number) => ({ limit: 5, used_today: used, remaining: 5 - used })

const desktopMatchMedia = window.matchMedia
afterEach(() => { Object.defineProperty(window, 'matchMedia', { configurable: true, value: desktopMatchMedia }) })
function phone() {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: (query: string) => ({
    matches: query.includes('max-width: 767px'), media: query, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true },
  }) })
}

const where = () => screen.getByTestId('where').textContent

function open(dialogues: unknown[] = [], used = 0, routes: Record<string, unknown> = {}) {
  const calls = mockApi({
    'GET /solo/practice/bank': BANK,
    'GET /solo/practice': { dialogues, quota: quota(used) },
    ...routes,
  })
  renderAt('/my-dialogues', '/my-dialogues', <MyDialoguesPage />)
  return calls
}

describe('first time (MyDialogFirst)', () => {
  test('every topic is a card that starts a dialogue', async () => {
    const calls = open([], 0, { 'POST /solo/practice': { activity_id: 'a-9', attempt_id: 't-9' } })
    expect(await screen.findByRole('heading', { level: 1, name: '我的對話' })).toBeInTheDocument()
    // 標題要等題庫和列表都回來才出現
    expect(await screen.findByRole('heading', { name: '挑一個題目開始' })).toBeInTheDocument()
    const cards = screen.getAllByRole('button', { name: /開始對話/ })
    expect(cards).toHaveLength(4)
    expect(cards[1]).toHaveTextContent('電車難題')
    expect(cards[1]).toHaveTextContent('生命與責任')
    expect(cards[1]).toHaveTextContent('一輛失控的電車')
    await act(async () => { fireEvent.click(cards[1]) })
    expect(calls.find(call => call.key === 'POST /solo/practice')?.body).toEqual({ bank_item_id: 'trolley' })
    await waitFor(() => expect(where()).toBe('/learn/activities/a-9/dialogue'))
  })

  test('a larger bank shows six recommended topics, a new random six on each visit', async () => {
    const random = jest.spyOn(Math, 'random').mockReturnValue(0)
    try {
      open([], 0, { 'GET /solo/practice/bank': [...MANY, NOT_RECOMMENDED] })
      await screen.findByRole('heading', { name: '挑一個題目開始' })
      expect(cardTitles()).toEqual(['題目 1', '題目 2', '題目 3', '題目 4', '題目 5', '題目 6'])
      cleanup()

      random.mockReturnValue(0.99)
      open([], 0, { 'GET /solo/practice/bank': [...MANY, NOT_RECOMMENDED] })
      await screen.findByRole('heading', { name: '挑一個題目開始' })
      const titles = cardTitles()
      expect(titles).toHaveLength(6)
      expect(titles).toContain('題目 10')
      expect(new Set(titles).size).toBe(6)
      // Still in bank order, and never a topic kept for 看全部題目.
      expect(titles).toEqual([...titles].sort((a, b) => Number(a.split(' ')[1]) - Number(b.split(' ')[1])))
      expect(titles).not.toContain('不推薦的題目')
    } finally {
      random.mockRestore()
    }
  })
})

describe('with dialogues (MyDialogList)', () => {
  test('dialogue cards show the topic, status, date and the right link', async () => {
    open([
      dialogue(),
      dialogue({ activity_id: 'a-2', attempt_id: 't-2', topic_id: 'trolley', title: '電車難題', body: '一輛失控的電車正駛向五名工人。你會拉下拉桿嗎？', category: 'life', status: 'completed' }),
    ], 2)
    const list = await screen.findByRole('list', { name: '最近的對話' })
    const [first, second] = within(list).getAllByRole('listitem')
    expect(first).toHaveTextContent('語言模型與學校學習')
    expect(first).toHaveTextContent('對話中')
    expect(first).toHaveTextContent('請問在 2026 年')
    expect(first).toHaveTextContent('11/13（五）')
    expect(within(first).getByRole('link', { name: /繼續對話/ })).toHaveAttribute('href', '/learn/activities/a-1/dialogue')
    expect(second).toHaveTextContent('已完成')
    expect(within(second).getByRole('link', { name: /看回顧/ })).toHaveAttribute('href', '/learn/activities/a-2/dialogue')
    expect(screen.getByText('今天還能開 3 段')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /最近的對話/ })).toHaveTextContent('2')
  })

  test('「還可以聊這些」lists only topics never started, two on a computer', async () => {
    open([dialogue(), dialogue({ activity_id: 'a-2', topic_id: 'trolley', status: 'completed' })], 2)
    const more = await screen.findByRole('region', { name: '還可以聊這些' })
    expect(within(more).getAllByRole('button', { name: /開始對話/ }).map(card => card.textContent))
      .toEqual([expect.stringContaining('說謊救朋友'), expect.stringContaining('忒修斯之船')])
  })

  test('the section disappears once every topic has been started', async () => {
    open(BANK.map((topic, index) => dialogue({ activity_id: `a-${index}`, topic_id: topic.id })), 4)
    await screen.findByRole('list', { name: '最近的對話' })
    expect(screen.queryByRole('region', { name: '還可以聊這些' })).toBeNull()
  })

  test('新對話 opens the picker; picking a topic previews it and starts it', async () => {
    const calls = open([dialogue()], 1, { 'POST /solo/practice': { activity_id: 'a-7', attempt_id: 't-7' } })
    fireEvent.click(await screen.findByRole('button', { name: '新對話' }))
    const picker = screen.getByRole('dialog', { name: '挑一個想聊的題目' })
    // Figma M3：電腦版是 820 寬的左清單右預覽
    expect(picker).toHaveClass('dialog__panel--wide')
    expect(within(picker).getByText('選好就直接開始，對話會存在「我的對話」· 今天還能開 4 段')).toBeInTheDocument()
    fireEvent.click(within(picker).getByRole('option', { name: /忒修斯之船/ }))
    expect(within(picker).getByText('全部換完之後，它還是同一艘船嗎？')).toBeInTheDocument()
    expect(within(picker).getByText('沒有標準答案。蘇格拉底會從這個問題出發，問你為什麼這樣想。')).toBeInTheDocument()
    await act(async () => { fireEvent.click(within(picker).getByRole('button', { name: '開始對話' })) })
    expect(calls.find(call => call.key === 'POST /solo/practice')?.body).toEqual({ bank_item_id: 'ship-of-theseus' })
    await waitFor(() => expect(where()).toBe('/learn/activities/a-7/dialogue'))
  })

  test('看全部題目 opens the same picker; cancel closes it', async () => {
    open([dialogue()], 1)
    fireEvent.click(await screen.findByRole('button', { name: '看全部題目' }))
    const picker = screen.getByRole('dialog', { name: '挑一個想聊的題目' })
    fireEvent.click(within(picker).getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('no new dialogues left today (MyDialogQuota)', () => {
  test('new dialogue is off, the notice explains, topic cards say come back tomorrow', async () => {
    open([dialogue()], 5)
    expect(await screen.findByRole('button', { name: '新對話' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('今天的 5 次新對話用完了，明天再來。之前的對話可以繼續。')
    const more = screen.getByRole('region', { name: '還可以聊這些' })
    const cards = within(more).getAllByRole('button').filter(button => button.textContent !== '看全部題目')
    expect(cards).toHaveLength(2)
    for (const card of cards) {
      expect(card).toBeDisabled()
      expect(card).toHaveTextContent('明天再來')
    }
    expect(screen.getByRole('link', { name: /繼續對話/ })).toBeInTheDocument()
  })

  test('a limit hit while starting reloads the quota and explains it', async () => {
    let used = 4
    mockApi({
      'GET /solo/practice/bank': BANK,
      'GET /solo/practice': () => ({ dialogues: [dialogue()], quota: quota(used) }),
      'POST /solo/practice': () => { used = 5; throw new ApiError(429, 'PRACTICE_DAILY_LIMIT') },
    })
    renderAt('/my-dialogues', '/my-dialogues', <MyDialoguesPage />)
    const more = await screen.findByRole('region', { name: '還可以聊這些' })
    await act(async () => { fireEvent.click(within(more).getAllByRole('button', { name: /開始對話/ })[0]) })
    expect(await screen.findByText('今天的 5 次新對話用完了，明天再來。之前的對話可以繼續。')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '新對話' })).toBeDisabled())
  })

  test('practice unavailable is explained without leaving the page', async () => {
    open([], 0, { 'POST /solo/practice': () => { throw new ApiError(503, 'PRACTICE_UNAVAILABLE') } })
    const cards = await screen.findAllByRole('button', { name: /開始對話/ })
    await act(async () => { fireEvent.click(cards[0]) })
    expect(await screen.findByRole('alert')).toHaveTextContent('練習暫時無法使用，請稍後再試。')
    expect(where()).toBe('/my-dialogues')
  })
})

describe('guest (MyDialogGuest)', () => {
  test('a guest sees the sign-up invitation and locked topics, and never asks for a list', async () => {
    const calls = mockApi({
      'GET /auth/me': { ...signedIn, kind: 'guest', email: '' },
      'GET /solo/practice/bank': BANK,
    })
    renderAt('/my-dialogues', '/my-dialogues', <MyDialoguesPage />)
    expect(await screen.findByText('註冊帳號，就能隨時跟蘇格拉底練習')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '註冊帳號' })).toHaveAttribute('href', '/guest/register')
    // 邀請文字一開始就有；鎖住的題目要等題庫回來才畫出來，所以這裡要等。
    const locked = await screen.findByRole('region', { name: '註冊後可以聊這些' })
    for (const card of within(locked).getAllByRole('button')) {
      expect(card).toBeDisabled()
      expect(card).toHaveTextContent('註冊後可以開始')
    }
    expect(calls.some(call => call.key === 'GET /solo/practice')).toBe(false)
  })

  test('a guest also sees at most six locked topics', async () => {
    mockApi({
      'GET /auth/me': { ...signedIn, kind: 'guest', email: '' },
      'GET /solo/practice/bank': MANY,
    })
    renderAt('/my-dialogues', '/my-dialogues', <MyDialoguesPage />)
    const locked = await screen.findByRole('region', { name: '註冊後可以聊這些' })
    expect(within(locked).getAllByRole('button')).toHaveLength(6)
  })
})

describe('phone', () => {
  test('the scan / code / join row sits on top of the page', async () => {
    phone()
    open([dialogue()], 1)
    expect(await screen.findByRole('button', { name: '掃描' })).toBeInTheDocument()
    expect(screen.getByLabelText('課程代碼')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '加入' })).toBeInTheDocument()
  })

  test('「還可以聊這些」shows at most six topics never started, a random six on each visit', async () => {
    phone()
    const random = jest.spyOn(Math, 'random').mockReturnValue(0)
    try {
      open([dialogue({ topic_id: 'topic-1' })], 1, { 'GET /solo/practice/bank': MANY })
      const more = await screen.findByRole('region', { name: '還可以聊這些' })
      expect(within(more).getAllByRole('button', { name: /開始對話/ }).map(card => card.querySelector('b')?.textContent))
        .toEqual(['題目 2', '題目 3', '題目 4', '題目 5', '題目 6', '題目 7'])
    } finally {
      random.mockRestore()
    }
  })

  test('the picker is a list that opens one topic at a time', async () => {
    phone()
    open([dialogue()], 1, { 'POST /solo/practice': { activity_id: 'a-8', attempt_id: 't-8' } })
    fireEvent.click(await screen.findByRole('button', { name: /新對話/ }))
    const picker = screen.getByRole('dialog', { name: '挑一個想聊的題目' })
    expect(picker).not.toHaveClass('dialog__panel--wide')
    const trolley = within(picker).getByRole('button', { name: /電車難題/ })
    expect(trolley).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(trolley)
    expect(trolley).toHaveAttribute('aria-expanded', 'true')
    expect(within(picker).getByText('一輛失控的電車正駛向五名工人。你會拉下拉桿嗎？')).toBeInTheDocument()
    await act(async () => { fireEvent.click(within(picker).getByRole('button', { name: '開始對話' })) })
    await waitFor(() => expect(where()).toBe('/learn/activities/a-8/dialogue'))
  })
})

test('a failed list load says so', async () => {
  mockApi({
    'GET /solo/practice/bank': BANK,
    'GET /solo/practice': () => { throw new ApiError(500, 'BOOM') },
  })
  renderAt('/my-dialogues', '/my-dialogues', <MyDialoguesPage />)
  expect(await screen.findByRole('alert')).toHaveTextContent('我的對話沒有載入成功。')
})

test('a failed topic-bank load says so instead of showing an empty start page', async () => {
  mockApi({
    'GET /solo/practice/bank': () => { throw new ApiError(500, 'BOOM') },
    'GET /solo/practice': { dialogues: [], quota: quota(0) },
  })
  renderAt('/my-dialogues', '/my-dialogues', <MyDialoguesPage />)
  expect(await screen.findByRole('alert')).toHaveTextContent('我的對話沒有載入成功。')
  expect(screen.queryByRole('heading', { name: '挑一個題目開始' })).toBeNull()
  expect(screen.queryByRole('button', { name: '新對話' })).toBeNull()
})

test('a guest whose topic bank fails to load is told so under the invitation', async () => {
  mockApi({
    'GET /auth/me': { ...signedIn, kind: 'guest', email: '' },
    'GET /solo/practice/bank': () => { throw new ApiError(500, 'BOOM') },
  })
  renderAt('/my-dialogues', '/my-dialogues', <MyDialoguesPage />)
  expect(await screen.findByRole('alert')).toHaveTextContent('我的對話沒有載入成功。')
  expect(screen.getByRole('link', { name: '註冊帳號' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '註冊後可以聊這些' })).toBeNull()
})

test('看全部題目 lists every topic; the cards only show the recommended ones', async () => {
  const extra = { id: 'extra-topic', title: '不推薦的題目', body: '只在全部題目裡出現。', category: 'self', recommended: false }
  mockApi({
    'GET /solo/practice/bank': [...BANK, extra],
    'GET /solo/practice': { dialogues: [dialogue()], quota: quota(1) },
  })
  renderAt('/my-dialogues', '/my-dialogues', <MyDialoguesPage />)
  fireEvent.click(await screen.findByRole('button', { name: '看全部題目' }))
  const picker = screen.getByRole('dialog', { name: '挑一個想聊的題目' })
  expect(within(picker).getByRole('option', { name: /不推薦的題目/ })).toBeInTheDocument()
  expect(screen.getByRole('region', { name: '還可以聊這些' })).not.toHaveTextContent('不推薦的題目')
})
