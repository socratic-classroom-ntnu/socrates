import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { Where } from '../../../testing/pageHarness'
import { InviteDialog } from './InviteDialog'
import { PROJECTOR_WINDOW_NAME } from './projectorNavigation'

jest.mock('qrcode', () => ({ toDataURL: jest.fn(async (value: string) => 'data:' + value) }))

const writeText = jest.fn(async () => {})
beforeEach(() => {
  writeText.mockClear()
  jest.spyOn(window, 'open').mockImplementation(() => null)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
})
afterEach(() => jest.restoreAllMocks())

function Opener({ kind }: { kind: 'course' | 'activity' }) {
  const props = kind === 'course'
    ? { name: '科技倫理', code: '3CKTGE7Q', url: 'http://localhost/join?code=3CKTGE7Q', projectorTo: '/teach/courses/c-1/projector' }
    : { name: '第三週倫理討論', url: 'http://localhost/activities/a-1/join', projectorTo: '/teach/activities/a-1/projector' }
  return <InviteDialog kind={kind} {...props} onClose={onClose} />
}
const onClose = jest.fn()

function open(kind: 'course' | 'activity') {
  render(<MemoryRouter initialEntries={['/teach/courses/c-1']}><Opener kind={kind} /><Where /></MemoryRouter>)
}

test('course invite encodes join url', async () => {
  open('course')
  expect(screen.getByRole('dialog', { name: '邀請學生加入「科技倫理」' })).toBeInTheDocument()
  const img = await screen.findByRole('img', { name: /QR code/ })
  expect(img).toHaveAttribute('src', 'data:http://localhost/join?code=3CKTGE7Q')
  expect(screen.getByText('3CKTGE7Q')).toBeInTheDocument()
})

test('copy invite link writes clipboard', async () => {
  open('course')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '複製邀請連結' })) })
  expect(writeText).toHaveBeenCalledWith('http://localhost/join?code=3CKTGE7Q')
  expect(await screen.findByRole('status')).toHaveTextContent('已複製')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '複製課程代碼' })) })
  expect(writeText).toHaveBeenLastCalledWith('3CKTGE7Q')
})

test('activity invite has no code row and encodes activity url', async () => {
  open('activity')
  expect(screen.getByRole('dialog', { name: '邀請學生參加「第三週倫理討論」' })).toBeInTheDocument()
  expect(await screen.findByRole('img', { name: /QR code/ })).toHaveAttribute('src', 'data:http://localhost/activities/a-1/join')
  expect(screen.queryByText('課程代碼')).toBeNull()
  expect(screen.queryByRole('switch')).toBeNull()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '複製活動連結' })) })
  expect(writeText).toHaveBeenCalledWith('http://localhost/activities/a-1/join')
})

test.each([
  ['course', '/teach/courses/c-1/projector'],
  ['activity', '/teach/activities/a-1/projector'],
] as const)('%s projector link opens or reuses the dedicated projector tab', (kind, path) => {
  open(kind)
  const link = screen.getByRole('link', { name: '投影到大螢幕' })
  expect(link).toHaveAttribute('target', PROJECTOR_WINDOW_NAME)
  fireEvent.click(link)
  expect(window.open).toHaveBeenCalledWith(path, PROJECTOR_WINDOW_NAME)
  expect(screen.getByTestId('where')).toHaveTextContent('/teach/courses/c-1')
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

test('focus returns to the opener on close', async () => {
  function Page() {
    const [open, setOpen] = useState(false)
    return <>
      <button onClick={() => setOpen(true)}>邀請學生</button>
      {open && <InviteDialog kind="course" name="科技倫理" code="3CKTGE7Q" url="http://localhost/join?code=3CKTGE7Q" projectorTo="/p" onClose={() => setOpen(false)} />}
    </>
  }
  render(<MemoryRouter><Page /></MemoryRouter>)
  const opener = screen.getByRole('button', { name: '邀請學生' })
  opener.focus()
  fireEvent.click(opener)
  await waitFor(() => expect(screen.getByRole('button', { name: '關閉' })).toHaveFocus())
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(opener).toHaveFocus()
})
