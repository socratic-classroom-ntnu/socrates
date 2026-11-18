import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ApiError, feedbackScreenshot, listFeedback } from '../../contract/classroomClient'
import { applyLocale } from '../../i18n'
import { FeedbackListPage } from './FeedbackListPage'

jest.mock('../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../contract/classroomClient')>('../../contract/classroomClient')
  return { ApiError: actual.ApiError, listFeedback: jest.fn(), feedbackScreenshot: jest.fn() }
})

const list = listFeedback as jest.Mock
const shot = feedbackScreenshot as jest.Mock

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f-1', created_at: 1_763_500_000, kind: 'problem', message: '按加入一直轉圈', contact: null,
    page: '/join', viewport_w: 390, viewport_h: 844, locale: 'zh-Hant', user_agent: 'Mozilla/5.0 (iPhone)',
    release_id: 'socrates-abc', identity: 'student', account_kind: 'registered', account_name: 'mei',
    has_screenshot: false, ...overrides,
  }
}

function renderPage() {
  return render(<MemoryRouter initialEntries={['/feedback']}><FeedbackListPage /></MemoryRouter>)
}

beforeEach(async () => {
  await applyLocale('zh-Hant')
  list.mockReset()
  shot.mockReset()
})

test('people who may not read it see the not-found page', async () => {
  list.mockRejectedValue(new ApiError(404, 'FEEDBACK_NOT_FOUND'))
  renderPage()
  expect(await screen.findByText('找不到這個頁面')).toBeInTheDocument()
})

test('each row says who sent it, from where, and offers the screenshot on demand', async () => {
  list.mockResolvedValue({
    page: 1, has_more: false,
    items: [
      item(),
      item({ id: 'f-2', identity: 'guest', account_kind: 'guest', account_name: '安靜的貓頭鷹', contact: '0912', has_screenshot: true }),
      item({ id: 'f-3', identity: 'guest', account_kind: 'expired_guest', account_name: null, contact: null }),
      item({ id: 'f-4', identity: 'anonymous', account_kind: null, account_name: null, contact: 'anon@example.edu', kind: null }),
      item({ id: 'f-5', identity: 'guest', account_kind: 'registered', account_name: 'ming' }),
    ],
  })
  renderPage()
  const rows = (await screen.findAllByRole('row')).slice(1)
  expect(rows).toHaveLength(5)
  expect(rows[0]).toHaveTextContent('學生')
  expect(rows[0]).toHaveTextContent('mei')
  expect(rows[0]).toHaveTextContent('/join')
  expect(rows[0]).toHaveTextContent('按加入一直轉圈')
  expect(rows[1]).toHaveTextContent('訪客')
  expect(rows[1]).toHaveTextContent('安靜的貓頭鷹')
  expect(rows[1]).toHaveTextContent('0912')
  expect(rows[2]).toHaveTextContent('過期訪客')
  expect(rows[3]).toHaveTextContent('未登入')
  expect(rows[3]).toHaveTextContent('anon@example.edu')
  expect(rows[4]).toHaveTextContent('現在是 ming')
  expect(within(rows[0]).queryByRole('button', { name: '看截圖' })).toBeNull()
  expect(screen.queryByRole('img')).toBeNull()

  const opened = { location: { href: '' }, close: jest.fn() }
  window.open = jest.fn(() => opened) as unknown as typeof window.open
  URL.createObjectURL = jest.fn(() => 'blob:shot')
  shot.mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
  fireEvent.click(within(rows[1]).getByRole('button', { name: '看截圖' }))
  expect(shot).toHaveBeenCalledWith('f-2')
  await screen.findAllByRole('row')
  expect(window.open).toHaveBeenCalled()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(opened.location.href).toBe('blob:shot')
})

test('pages move forward and back by has_more', async () => {
  list.mockImplementation(async (page: number) => ({ page, has_more: page === 1, items: [item({ id: `f-${page}`, message: `第 ${page} 頁的回饋` })] }))
  renderPage()
  expect(await screen.findByText('第 1 頁的回饋')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '上一頁' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '下一頁' }))
  expect(await screen.findByText('第 2 頁的回饋')).toBeInTheDocument()
  expect(list).toHaveBeenLastCalledWith(2)
  expect(screen.getByRole('button', { name: '下一頁' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '上一頁' }))
  expect(await screen.findByText('第 1 頁的回饋')).toBeInTheDocument()
})

test('paging waits for the page it asked for before offering the next one', async () => {
  let release: () => void = () => undefined
  list.mockImplementation((page: number) => page === 1
    ? Promise.resolve({ page, has_more: true, items: [item({ message: '第 1 頁的回饋' })] })
    : new Promise(resolve => { release = () => resolve({ page, has_more: true, items: [item({ message: `第 ${page} 頁的回饋` })] }) }))
  renderPage()
  expect(await screen.findByText('第 1 頁的回饋')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '下一頁' }))
  expect(screen.getByRole('button', { name: '下一頁' })).toBeDisabled()
  expect(screen.queryByText('第 1 頁的回饋')).toBeNull()
  release()
  expect(await screen.findByText('第 2 頁的回饋')).toBeInTheDocument()
})
