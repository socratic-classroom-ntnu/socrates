import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from '../../app/AppShell'
import { getNotifications, markNotificationRead, type Notification } from '../../contract/notificationClient'
import { useAuth } from '../auth/AuthContext'
import { NotificationsProvider } from './NotificationsProvider'
import { NotificationsPage } from './NotificationsPage'

jest.mock('../../contract/notificationClient')
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }))

const announcement = (id: string, title: string, pop_up = false, read = false): Notification => ({
  id, title, content: '第一行\n第二行', type: 'announcement', read, pop_up, time: 200,
  maintenance: { date: '2026-12-12', start: '00:00', end: '06:00' },
})
const expiry: Notification = {
  id: 'guest_expiry', type: 'guest_expiry', title: '', content: '', time: 100, read: true,
  pop_up: false, guest_expires_at: Date.UTC(2026, 10, 21, 12) / 1000,
}
const activity: Notification = {
  id: 'activity:a-1', type: 'activity', title: '', content: '', time: 50, read: true,
  pop_up: false, course_name: '科技倫理', activity_name: '電車難題', activity_id: 'a-1',
}
const desktop = window.matchMedia
function viewer(role: 'student' | 'teacher' = 'student', verified = true, id = 'account') {
  jest.mocked(useAuth).mockReturnValue({
    status: 'ready', account: { id, account_role: role, verified, kind: 'registered', csrf_token: 'csrf', username: 'test' },
  } as ReturnType<typeof useAuth>)
}
function phoneViewport() {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: (query: string) => ({
    ...desktop(query), matches: query.includes('max-width: 767px'),
  }) })
}
function tree(path: string) {
  return <StrictMode><MemoryRouter initialEntries={[path]}><NotificationsProvider><Routes>
    <Route element={<AppShell />}>
      <Route path="/" element={<Link to="/fullscreen">離開外框</Link>} />
      <Route path="/notifications" element={<NotificationsPage />} />
    </Route>
    <Route path="/fullscreen" element={<Link to="/">回外框</Link>} />
  </Routes></NotificationsProvider></MemoryRouter></StrictMode>
}

beforeEach(() => {
  jest.resetAllMocks()
  viewer()
  jest.mocked(getNotifications).mockResolvedValue([])
  jest.mocked(markNotificationRead).mockResolvedValue(null)
})
afterEach(() => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: desktop })
})

test('lists read and unread items, opens the detail and clears the last unread dot', async () => {
  jest.mocked(getNotifications).mockResolvedValue([announcement('announcement:1', '維護公告'), expiry, activity])
  render(tree('/notifications'))
  expect(await screen.findByText('維護公告')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '通知中心 有未讀' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByText('全站公告')).toBeInTheDocument()
  expect(screen.getByText('帳號提醒')).toBeInTheDocument()
  expect(screen.getByText('課程通知')).toBeInTheDocument()
  fireEvent.click(screen.getAllByRole('button', { name: /查看完整內容/ })[0])
  const dialog = screen.getByRole('dialog', { name: '維護公告' })
  expect(within(dialog).getByText('00:00 — 06:00')).toBeInTheDocument()
  expect(within(dialog).getByText(/第一行/)).toHaveTextContent('第一行 第二行')
  await waitFor(() => expect(screen.getByRole('link', { name: '通知中心' })).toBeInTheDocument())
  expect(markNotificationRead).toHaveBeenCalledWith('announcement:1')
  fireEvent.keyDown(document, { key: 'Escape' })
  fireEvent.click(screen.getAllByRole('button', { name: /查看完整內容/ })[1])
  expect(screen.getByRole('link', { name: '前往註冊帳號' })).toHaveAttribute('href', '/guest/register')
  fireEvent.keyDown(document, { key: 'Escape' })
  fireEvent.click(screen.getAllByRole('button', { name: /查看完整內容/ })[2])
  expect(screen.getByRole('link', { name: '前往活動頁面' })).toHaveAttribute('href', '/learn/activities/a-1')
})

test('retries a failed request and displays the empty state', async () => {
  jest.mocked(getNotifications).mockRejectedValueOnce(new Error('offline'))
  render(tree('/notifications'))
  fireEvent.click(await screen.findByRole('button', { name: '重試' }))
  expect(await screen.findByText('目前沒有通知')).toBeInTheDocument()
  expect(getNotifications).toHaveBeenCalledTimes(2)
})

test('shows only eligible announcements in order, handles a read failure, and keeps the entry snapshot', async () => {
  jest.mocked(getNotifications).mockResolvedValue([
    announcement('announcement:2', '第二則', true),
    announcement('announcement:1', '第一則', true),
    announcement('announcement:0', '免跳出'),
    expiry,
  ])
  jest.mocked(markNotificationRead).mockRejectedValueOnce(new Error('offline'))
  render(tree('/'))
  const second = await screen.findByRole('dialog', { name: '第二則' })
  fireEvent.click(within(second).getByRole('button', { name: '我知道了' }))
  expect(await screen.findByRole('dialog', { name: '第一則' })).toBeInTheDocument()
  fireEvent.keyDown(document, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole('link', { name: '通知中心 有未讀' }))
  fireEvent.click(screen.getByRole('link', { name: '首頁' }))
  fireEvent.click(screen.getByRole('link', { name: '離開外框' }))
  fireEvent.click(screen.getByRole('link', { name: '回外框' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(getNotifications).toHaveBeenCalledTimes(1)
})

test('screens without a shell and unverified accounts skip the initial request', async () => {
  viewer('student', false)
  render(tree('/fullscreen'))
  expect(getNotifications).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('link', { name: '回外框' }))
  expect(getNotifications).not.toHaveBeenCalled()
})

test('discarded accounts cannot display their stale request after a switch', async () => {
  let finish: (rows: Notification[]) => void = () => undefined
  jest.mocked(getNotifications).mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  const view = render(tree('/notifications'))
  viewer('student', true, 'another-account')
  view.rerender(tree('/notifications'))
  expect(await screen.findByText('目前沒有通知')).toBeInTheDocument()
  finish([announcement('announcement:1', '前一個帳號', true)])
  await waitFor(() => expect(screen.queryByText('前一個帳號')).not.toBeInTheDocument())
  expect(getNotifications).toHaveBeenCalledTimes(2)
})

test('the third phone item shows unread status without a count and the whole card opens', async () => {
  phoneViewport()
  jest.mocked(getNotifications).mockResolvedValue([announcement('announcement:1', '維護公告')])
  render(tree('/notifications'))
  const nav = within(screen.getByRole('navigation', { name: '主選單' }))
  expect((await nav.findAllByRole('link'))[2]).toHaveAccessibleName('通知 有未讀')
  expect(nav.getByRole('link', { name: '通知 有未讀' })).toHaveAttribute('aria-current', 'page')
  fireEvent.click(screen.getByRole('button', { name: /查看完整內容：維護公告/ }))
  expect(screen.getByRole('dialog', { name: '維護公告' })).toBeInTheDocument()
  await waitFor(() => expect(nav.getByRole('link', { name: '通知' })).toBeInTheDocument())
})

test('teachers can open the phone page without a phone nav item', async () => {
  viewer('teacher')
  phoneViewport()
  render(tree('/notifications'))
  expect(await screen.findByText('目前沒有通知')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /通知/ })).not.toBeInTheDocument()
})
