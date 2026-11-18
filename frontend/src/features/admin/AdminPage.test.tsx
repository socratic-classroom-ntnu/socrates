import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { addAdmin, ApiError, feedbackScreenshot, listAdmins, listFeedback, listToggles, removeAdmin, updateToggle } from '../../contract/classroomClient'
import { applyLocale } from '../../i18n'
import { useAuth } from '../auth/AuthContext'
import { AdminGate } from './AdminGate'
import { AdminPage } from './AdminPage'

jest.mock('../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../contract/classroomClient')>('../../contract/classroomClient')
  return {
    ApiError: actual.ApiError,
    listToggles: jest.fn(), updateToggle: jest.fn(), listAdmins: jest.fn(), addAdmin: jest.fn(), removeAdmin: jest.fn(),
    listFeedback: jest.fn(), feedbackScreenshot: jest.fn(),
  }
})
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }))

const auth = useAuth as jest.Mock
const toggles = listToggles as jest.Mock
const update = updateToggle as jest.Mock
const admins = listAdmins as jest.Mock
const add = addAdmin as jest.Mock
const remove = removeAdmin as jest.Mock
const feedback = listFeedback as jest.Mock
const shot = feedbackScreenshot as jest.Mock

const refreshAuth = jest.fn()
const me = { id: 'a-1', username: 'wang', kind: 'registered', verified: true, is_admin: true, account_role: 'teacher' }

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route element={<AdminGate />}>
        <Route path="/admin" element={<AdminPage tab="toggles" />} />
        <Route path="/admin/feedback" element={<AdminPage tab="feedback" />} />
        <Route path="/admin/admins" element={<AdminPage tab="admins" />} />
      </Route>
    </Routes>
  </MemoryRouter>)
}

const groupMode = { key: 'group_mode', name: '多人模式', description: '分組課（多人教室）。', enabled: false, updated_at: null, updated_by_name: null }

beforeEach(async () => {
  await applyLocale('zh-Hant')
  for (const mock of [toggles, update, admins, add, remove, feedback, shot]) mock.mockReset()
  refreshAuth.mockReset()
  auth.mockReturnValue({ status: 'ready', account: me, refresh: refreshAuth })
  toggles.mockResolvedValue([groupMode])
})

test.each([
  ['signed out', { status: 'anonymous', account: null }],
  ['a guest', { status: 'ready', account: { ...me, kind: 'guest', is_admin: false } }],
  ['unverified', { status: 'ready', account: { ...me, verified: false } }],
  ['not an admin', { status: 'ready', account: { ...me, is_admin: false } }],
])('%s sees the not-found page on every admin route', (_, state) => {
  auth.mockReturnValue(state)
  for (const path of ['/admin', '/admin/feedback', '/admin/admins']) {
    const { unmount } = renderAt(path)
    expect(screen.getByText('找不到這個頁面')).toBeInTheDocument()
    unmount()
  }
  expect(toggles).not.toHaveBeenCalled()
})

test('the switches tab lists each switch with who changed it last', async () => {
  toggles.mockResolvedValue([groupMode, { ...groupMode, key: 'other', name: '另一個', enabled: true, updated_at: 1_763_500_000, updated_by_name: 'fizzy' }])
  renderAt('/admin')
  expect(await screen.findByRole('heading', { level: 1, name: '後台' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '功能開關' })).toHaveAttribute('aria-selected', 'true')
  const first = screen.getByRole('switch', { name: '多人模式' })
  expect(first).toHaveAttribute('aria-checked', 'false')
  expect(screen.getByText('還沒有人改過')).toBeInTheDocument()
  expect(screen.getByText(/最後由 fizzy 在/)).toBeInTheDocument()
})

test('turning a switch on sends it at once', async () => {
  update.mockResolvedValue({ ...groupMode, enabled: true, updated_at: 1, updated_by_name: 'wang' })
  renderAt('/admin')
  fireEvent.click(await screen.findByRole('switch', { name: '多人模式' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith('group_mode', true))
  expect(await screen.findByRole('switch', { name: '多人模式' })).toHaveAttribute('aria-checked', 'true')
})

test('turning group mode off asks first', async () => {
  toggles.mockResolvedValue([{ ...groupMode, enabled: true }])
  update.mockResolvedValue({ ...groupMode, enabled: false, updated_at: 2, updated_by_name: 'wang' })
  renderAt('/admin')
  fireEvent.click(await screen.findByRole('switch', { name: '多人模式' }))
  const dialog = await screen.findByRole('dialog', { name: '關閉多人模式？' })
  expect(update).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: '關閉多人模式' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith('group_mode', false))
})

test('a failed switch says so and keeps the old state', async () => {
  update.mockRejectedValue(new ApiError(500, 'boom'))
  renderAt('/admin')
  fireEvent.click(await screen.findByRole('switch', { name: '多人模式' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('沒有改成功，請再試一次。')
  expect(screen.getByRole('switch', { name: '多人模式' })).toHaveAttribute('aria-checked', 'false')
})

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'f-1', created_at: 1_763_500_000, kind: 'problem', message: '按加入一直轉圈', contact: null, page: '/join',
  viewport_w: 390, viewport_h: 844, locale: 'zh-Hant', user_agent: 'Mozilla/5.0 (iPhone)', release_id: 'socrates-abc',
  identity: 'student', account_kind: 'registered', account_name: 'mei', has_screenshot: true, ...overrides,
})

test('the feedback tab shows time, type and message, and the eye opens every detail', async () => {
  feedback.mockResolvedValue({ page: 1, has_more: false, items: [row(), row({ id: 'f-2', kind: 'suggestion', has_screenshot: false }), row({ id: 'f-3', kind: null })] })
  shot.mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
  URL.createObjectURL = jest.fn(() => 'blob:shot')
  renderAt('/admin/feedback')
  const rows = (await screen.findAllByRole('row')).slice(1)
  expect(within(rows[0]).getAllByRole('cell')).toHaveLength(4)
  expect(within(rows[0]).getByText('問題')).toHaveAttribute('data-kind', 'problem')
  expect(within(rows[1]).getByText('建議')).toHaveAttribute('data-kind', 'suggestion')
  expect(within(rows[2]).getByText('—')).toBeInTheDocument()
  expect(within(rows[0]).queryByText('/join')).toBeNull()

  fireEvent.click(within(rows[0]).getByRole('button', { name: '看詳情' }))
  const dialog = await screen.findByRole('dialog', { name: '回饋詳情' })
  for (const text of ['按加入一直轉圈', '/join', '學生 · mei', 'Mozilla/5.0 (iPhone)', 'socrates-abc', '90 天後自動刪除']) {
    expect(within(dialog).getByText(text, { exact: false })).toBeInTheDocument()
  }
  const image = await within(dialog).findByRole('img', { name: '截圖' })
  expect(image).toHaveAttribute('src', 'blob:shot')
  expect(within(dialog).getByRole('link', { name: '截圖' })).toHaveAttribute('target', '_blank')
  expect(shot).toHaveBeenCalledWith('f-1')
})

test('the admins tab adds by username, explains failures, and cannot remove you', async () => {
  admins.mockResolvedValue([
    { account_id: 'a-1', username: 'wang', display_name: '王老師', account_role: 'teacher', is_you: true },
    { account_id: 'a-2', username: 'mei', display_name: '小美', account_role: 'student', is_you: false },
  ])
  add.mockRejectedValueOnce(new ApiError(404, 'ADMIN_ACCOUNT_NOT_FOUND'))
    .mockRejectedValueOnce(new ApiError(422, 'ADMIN_GUEST_NOT_ALLOWED'))
    .mockRejectedValueOnce(new ApiError(422, 'ADMIN_UNVERIFIED'))
    .mockRejectedValueOnce(new ApiError(409, 'ADMIN_ALREADY'))
    .mockResolvedValueOnce({ account_id: 'a-3', username: 'qa', display_name: 'qa', account_role: 'teacher', is_you: false })
  renderAt('/admin/admins')
  const list = await screen.findByRole('region', { name: '目前的管理員' })
  const you = within(list).getByText('王老師').closest('li') as HTMLElement
  expect(within(you).getByText('你自己')).toBeInTheDocument()
  expect(within(you).queryByRole('button', { name: '移除' })).toBeNull()

  const field = screen.getByRole('textbox', { name: '新增管理員' })
  for (const message of ['找不到這個帳號', '訪客帳號不能設成管理員', '這個帳號還沒驗證 Email', '已經是管理員了']) {
    fireEvent.change(field, { target: { value: 'someone' } })
    fireEvent.click(screen.getByRole('button', { name: '新增' }))
    expect(await screen.findByText(message)).toBeInTheDocument()
  }
  admins.mockResolvedValue([])
  fireEvent.change(field, { target: { value: 'qa' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '新增' })) })
  expect(add).toHaveBeenLastCalledWith('qa')
  expect(admins).toHaveBeenCalledTimes(2)
})

test('removing an admin asks first', async () => {
  admins.mockResolvedValue([
    { account_id: 'a-1', username: 'wang', display_name: '王老師', account_role: 'teacher', is_you: true },
    { account_id: 'a-2', username: 'mei', display_name: '小美', account_role: 'student', is_you: false },
  ])
  remove.mockResolvedValue(null)
  renderAt('/admin/admins')
  const meiRow = (await screen.findByText('小美')).closest('li') as HTMLElement
  fireEvent.click(within(meiRow).getByRole('button', { name: '移除' }))
  const dialog = await screen.findByRole('dialog', { name: '移除 mei 的管理員身分？' })
  expect(remove).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: '移除' }))
  await waitFor(() => expect(remove).toHaveBeenCalledWith('a-2'))
})

test('an admin removed meanwhile is sent back to the not-found page', async () => {
  toggles.mockRejectedValue(new ApiError(404, 'ADMIN_NOT_FOUND'))
  renderAt('/admin')
  await waitFor(() => expect(refreshAuth).toHaveBeenCalled())
})

test('failed reads say so instead of showing empty or write errors', async () => {
  toggles.mockRejectedValue(new ApiError(500, 'boom'))
  const first = renderAt('/admin')
  expect(await screen.findByText('讀不到功能開關，請重新整理頁面。')).toBeInTheDocument()
  first.unmount()
  admins.mockRejectedValue(new ApiError(500, 'boom'))
  const second = renderAt('/admin/admins')
  expect(await screen.findByText('讀不到管理員名單，請重新整理頁面。')).toBeInTheDocument()
  expect(screen.queryByText(/0 位/)).toBeNull()
  second.unmount()
  feedback.mockRejectedValue(new ApiError(500, 'boom'))
  renderAt('/admin/feedback')
  expect(await screen.findByText('讀不到意見回饋，請重新整理頁面。')).toBeInTheDocument()
})

test('a screenshot that cannot be read says so', async () => {
  feedback.mockResolvedValue({ page: 1, has_more: false, items: [row()] })
  shot.mockRejectedValue(new ApiError(404, 'FEEDBACK_NOT_FOUND'))
  renderAt('/admin/feedback')
  fireEvent.click(await screen.findByRole('button', { name: '看詳情' }))
  expect(await screen.findByText('讀不到截圖（可能已超過 90 天被刪除）')).toBeInTheDocument()
})
