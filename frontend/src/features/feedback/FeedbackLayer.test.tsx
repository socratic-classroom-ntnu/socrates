import { act, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ApiError, sendFeedback } from '../../contract/classroomClient'
import { applyLocale } from '../../i18n'
import { useAuth } from '../auth/AuthContext'
import { FeedbackLayer } from './FeedbackLayer'
import { hiddenOn } from './hiddenOn'
import { prepareScreenshot } from './screenshot'

jest.mock('../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../contract/classroomClient')>('../../contract/classroomClient')
  return { ApiError: actual.ApiError, sendFeedback: jest.fn() }
})
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('./screenshot', () => {
  const actual = jest.requireActual<typeof import('./screenshot')>('./screenshot')
  return { ...actual, prepareScreenshot: jest.fn() }
})

const send = sendFeedback as jest.Mock
const auth = useAuth as jest.Mock
const prepare = prepareScreenshot as jest.Mock

function signedIn(kind: 'registered' | 'guest' = 'registered') {
  auth.mockReturnValue({ status: 'ready', account: { id: 'a-1', kind, username: 'mei' } })
}

function phone(on: boolean) {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: (query: string) => ({
    matches: on, media: query, addEventListener: jest.fn(), removeEventListener: jest.fn(),
  }) })
}

function renderAt(path = '/learn/courses/c-1?code=ABC#x') {
  return render(<MemoryRouter initialEntries={[path]}><FeedbackLayer /></MemoryRouter>)
}

async function open() {
  fireEvent.click(screen.getByRole('button', { name: '意見回饋' }))
  return screen.findByRole('dialog')
}

function image(name = 'shot.png', type = 'image/png') {
  return new File([new Uint8Array([1, 2, 3])], name, { type })
}

beforeEach(async () => {
  await applyLocale('zh-Hant')
  send.mockReset()
  prepare.mockReset()
  prepare.mockImplementation(async (file: File) => ({ mime: 'image/jpeg', dataBase64: 'AAAA', name: file.name, size: 420_000 }))
  signedIn()
  phone(false)
})

afterEach(() => {
  jest.useRealTimers()
})

test('the button is hidden only on the scan page and the projector pages', () => {
  expect(hiddenOn('/scan')).toBe(true)
  expect(hiddenOn('/scan/')).toBe(true)
  expect(hiddenOn('/teach/courses/c-1/projector')).toBe(true)
  expect(hiddenOn('/teach/activities/a-1/projector')).toBe(true)
  for (const path of ['/', '/login', '/verify', '/join/guest', '/learn/activities/a-1/dialogue', '/teach/activities/a-1', '/feedback']) {
    expect({ path, hidden: hiddenOn(path) }).toEqual({ path, hidden: false })
  }
})

test('the floating button is on ordinary pages and not on the scan page', () => {
  const { unmount } = renderAt('/')
  expect(screen.getByRole('button', { name: '意見回饋' })).toBeInTheDocument()
  unmount()
  renderAt('/scan')
  expect(screen.queryByRole('button', { name: '意見回饋' })).toBeNull()
})

test('send stays disabled until there is something to say', async () => {
  renderAt()
  const dialog = await open()
  const sendButton = within(dialog).getByRole('button', { name: '送出' })
  expect(sendButton).toBeDisabled()
  fireEvent.change(within(dialog).getByRole('textbox', { name: '回饋內容' }), { target: { value: '   ' } })
  expect(sendButton).toBeDisabled()
  fireEvent.change(within(dialog).getByRole('textbox', { name: '回饋內容' }), { target: { value: '轉圈' } })
  expect(sendButton).toBeEnabled()
})

test('a registered account sees no contact field; signed-out people and guests do', async () => {
  const { unmount } = renderAt()
  expect(within(await open()).queryByRole('textbox', { name: '聯絡方式（選填）' })).toBeNull()
  unmount()
  signedIn('guest')
  const second = renderAt()
  expect(within(await open()).getByRole('textbox', { name: '聯絡方式（選填）' })).toBeInTheDocument()
  second.unmount()
  auth.mockReturnValue({ status: 'anonymous', account: null })
  renderAt('/login')
  expect(within(await open()).getByRole('textbox', { name: '聯絡方式（選填）' })).toBeInTheDocument()
})

test('the type can be picked and picked again to clear; the body carries only the pathname', async () => {
  send.mockResolvedValue({ id: 'f-1' })
  auth.mockReturnValue({ status: 'anonymous', account: null })
  renderAt()
  const dialog = await open()
  const problem = within(dialog).getByRole('button', { name: '問題' })
  fireEvent.click(problem)
  expect(problem).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(within(dialog).getByRole('button', { name: '建議' }))
  expect(problem).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(within(dialog).getByRole('button', { name: '建議' }))
  fireEvent.click(problem)
  fireEvent.change(within(dialog).getByRole('textbox', { name: '回饋內容' }), { target: { value: ' 一直轉圈 ' } })
  fireEvent.change(within(dialog).getByRole('textbox', { name: '聯絡方式（選填）' }), { target: { value: 'mei@example.edu' } })
  fireEvent.click(within(dialog).getByRole('button', { name: '送出' }))
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
  expect(send.mock.calls[0][0]).toEqual({
    kind: 'problem',
    message: '一直轉圈',
    contact: 'mei@example.edu',
    page: '/learn/courses/c-1',
    viewport: { w: window.innerWidth, h: window.innerHeight },
    locale: 'zh-Hant',
    screenshot: null,
  })
})

test('while sending everything is locked and Esc does not close it', async () => {
  let finish: (value: unknown) => void = () => undefined
  send.mockReturnValue(new Promise(resolve => { finish = resolve }))
  renderAt()
  const dialog = await open()
  fireEvent.change(within(dialog).getByRole('textbox', { name: '回饋內容' }), { target: { value: '轉圈' } })
  fireEvent.click(within(dialog).getByRole('button', { name: '送出' }))
  const busy = await within(dialog).findByRole('button', { name: '送出中…' })
  expect(busy).toBeDisabled()
  expect(within(dialog).getByRole('textbox', { name: '回饋內容' })).toBeDisabled()
  expect(within(dialog).getByRole('button', { name: '取消' })).toBeDisabled()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  await act(async () => { finish({ id: 'f-1' }) })
})

test('after sending the dialog closes and the thanks note goes away after about three seconds', async () => {
  jest.useFakeTimers()
  send.mockResolvedValue({ id: 'f-1' })
  renderAt()
  const dialog = await open()
  fireEvent.change(within(dialog).getByRole('textbox', { name: '回饋內容' }), { target: { value: '轉圈' } })
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '送出' })) })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('status')).toHaveTextContent('謝謝，我們收到了')
  act(() => { jest.advanceTimersByTime(3100) })
  expect(screen.queryByText('謝謝，我們收到了')).toBeNull()
})

test('a failure keeps the text and the screenshot and says so; too many sends say that instead', async () => {
  send.mockRejectedValueOnce(new ApiError(500, 'boom'))
  renderAt()
  const dialog = await open()
  fireEvent.change(within(dialog).getByRole('textbox', { name: '回饋內容' }), { target: { value: '轉圈' } })
  fireEvent.paste(within(dialog).getByRole('textbox', { name: '回饋內容' }), { clipboardData: { files: [image()] } })
  expect(await within(dialog).findByText('shot.png')).toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: '送出' }))
  expect(await within(dialog).findByText('沒有送出去，請稍後再送一次。你寫的內容還在。')).toBeInTheDocument()
  expect(within(dialog).getByRole('textbox', { name: '回饋內容' })).toHaveValue('轉圈')
  expect(within(dialog).getByText('shot.png')).toBeInTheDocument()
  expect(send.mock.calls[0][0].screenshot).toEqual({ mime: 'image/jpeg', data_base64: 'AAAA' })

  send.mockRejectedValueOnce(new ApiError(429, 'RATE_LIMITED'))
  fireEvent.click(within(dialog).getByRole('button', { name: '送出' }))
  expect(await within(dialog).findByText('送出太頻繁了，請過幾分鐘再送。你寫的內容還在。')).toBeInTheDocument()
})

test('a send that never answers gives up and unlocks with the failure message', async () => {
  send.mockRejectedValue(new DOMException('aborted', 'AbortError'))
  renderAt()
  const dialog = await open()
  fireEvent.change(within(dialog).getByRole('textbox', { name: '回饋內容' }), { target: { value: '轉圈' } })
  fireEvent.click(within(dialog).getByRole('button', { name: '送出' }))
  expect(await within(dialog).findByText('沒有送出去，請稍後再送一次。你寫的內容還在。')).toBeInTheDocument()
  expect(within(dialog).getByRole('textbox', { name: '回饋內容' })).toBeEnabled()
})

test('on a computer a pasted or dropped image attaches, and a new one replaces the old', async () => {
  renderAt()
  const dialog = await open()
  expect(within(dialog).getByText('選填，1 張圖片，也可以直接貼上')).toBeInTheDocument()
  fireEvent.paste(within(dialog).getByRole('textbox', { name: '回饋內容' }), { clipboardData: { files: [image('first.png')] } })
  expect(await within(dialog).findByText('first.png')).toBeInTheDocument()
  fireEvent.drop(within(dialog).getByRole('textbox', { name: '回饋內容' }), { dataTransfer: { types: ['Files'], files: [image('second.png')] } })
  expect(await within(dialog).findByText('second.png')).toBeInTheDocument()
  expect(within(dialog).queryByText('first.png')).toBeNull()
  fireEvent.click(within(dialog).getByRole('button', { name: '移除截圖' }))
  expect(within(dialog).queryByText('second.png')).toBeNull()
  expect(within(dialog).getByRole('button', { name: '附加截圖' })).toBeInTheDocument()
})

test('a file that is not an image is refused', async () => {
  renderAt()
  const dialog = await open()
  fireEvent.paste(within(dialog).getByRole('textbox', { name: '回饋內容' }), { clipboardData: { files: [image('notes.pdf', 'application/pdf')] } })
  expect(await within(dialog).findByText('只能附加圖片')).toBeInTheDocument()
  expect(prepare).not.toHaveBeenCalled()
})

test('on a phone the hint does not mention pasting and pasting does nothing', async () => {
  phone(true)
  renderAt()
  const dialog = await open()
  expect(within(dialog).getByText('選填，1 張圖片')).toBeInTheDocument()
  fireEvent.paste(within(dialog).getByRole('textbox', { name: '回饋內容' }), { clipboardData: { files: [image()] } })
  fireEvent.drop(within(dialog).getByRole('textbox', { name: '回饋內容' }), { dataTransfer: { types: ['Files'], files: [image()] } })
  await act(async () => undefined)
  expect(prepare).not.toHaveBeenCalled()
  expect(within(dialog).getByRole('button', { name: '附加截圖' })).toBeInTheDocument()
})

test('the attach button opens the picker for images only', async () => {
  renderAt()
  const dialog = await open()
  const input = dialog.querySelector('input[type="file"]') as HTMLInputElement
  expect(input).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp')
  fireEvent.change(input, { target: { files: [image('picked.png')] } })
  expect(await within(dialog).findByText('picked.png')).toBeInTheDocument()
})

test('send waits for a screenshot that is still being shrunk, and only the newest pick counts', async () => {
  const pending: Array<(value: unknown) => void> = []
  prepare.mockImplementation((file: File) => new Promise(resolve => {
    pending.push(() => resolve({ mime: 'image/jpeg', dataBase64: file.name, name: file.name, size: 1000 }))
  }))
  send.mockResolvedValue({ id: 'f-1' })
  renderAt()
  const dialog = await open()
  fireEvent.change(within(dialog).getByRole('textbox', { name: '回饋內容' }), { target: { value: '轉圈' } })
  fireEvent.paste(within(dialog).getByRole('textbox', { name: '回饋內容' }), { clipboardData: { files: [image('old.png')] } })
  fireEvent.paste(within(dialog).getByRole('textbox', { name: '回饋內容' }), { clipboardData: { files: [image('new.png')] } })
  await waitFor(() => expect(pending).toHaveLength(2))
  expect(within(dialog).getByRole('button', { name: '送出' })).toBeDisabled()
  await act(async () => { pending[1](undefined) })
  await act(async () => { pending[0](undefined) })
  expect(within(dialog).getByText('new.png')).toBeInTheDocument()
  expect(within(dialog).queryByText('old.png')).toBeNull()
  fireEvent.click(within(dialog).getByRole('button', { name: '送出' }))
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
  expect(send.mock.calls[0][0].screenshot).toEqual({ mime: 'image/jpeg', data_base64: 'new.png' })
})

test('send waits until we know who is signed in', async () => {
  auth.mockReturnValue({ status: 'loading', account: null })
  renderAt()
  const dialog = await open()
  fireEvent.change(within(dialog).getByRole('textbox', { name: '回饋內容' }), { target: { value: '轉圈' } })
  expect(within(dialog).getByRole('button', { name: '送出' })).toBeDisabled()
})

test('an image dropped anywhere on the dialog attaches, not only on the text box', async () => {
  renderAt()
  const dialog = await open()
  fireEvent.drop(within(dialog).getByRole('button', { name: '取消' }), { dataTransfer: { types: ['Files'], files: [image('footer.png')] } })
  expect(await within(dialog).findByText('footer.png')).toBeInTheDocument()
})

test('dragging text inside the dialog is left alone; only dropped files are taken', async () => {
  renderAt()
  const dialog = await open()
  const box = within(dialog).getByRole('textbox', { name: '回饋內容' })
  const textDrop = createEvent.drop(box, { dataTransfer: { types: ['text/plain'], files: [] } })
  fireEvent(box, textDrop)
  expect(textDrop.defaultPrevented).toBe(false)
  const fileDrop = createEvent.drop(box, { dataTransfer: { types: ['Files'], files: [image('drop.png')] } })
  fireEvent(box, fileDrop)
  expect(fileDrop.defaultPrevented).toBe(true)
  expect(await within(dialog).findByText('drop.png')).toBeInTheDocument()
})

test('a page address that starts with several slashes is sent as one site path', async () => {
  send.mockResolvedValue({ id: 'f-1' })
  renderAt('//learn//x')
  const dialog = await open()
  fireEvent.change(within(dialog).getByRole('textbox', { name: '回饋內容' }), { target: { value: '轉圈' } })
  fireEvent.click(within(dialog).getByRole('button', { name: '送出' }))
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
  expect(send.mock.calls[0][0].page).toBe('/learn//x')
})
