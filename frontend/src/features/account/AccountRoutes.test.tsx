import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { api, checkAccountDeletion } from '../../contract/classroomClient'
import { applyLocale } from '../../i18n'
import { useAuth } from '../auth/AuthContext'
import { AccountSettingsPage } from './AccountSettingsPage'
import { AccountSubpage } from './AccountSubpage'

jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../../contract/classroomClient', () => ({
  ...jest.requireActual('../../contract/classroomClient'),
  api: jest.fn(),
  checkAccountDeletion: jest.fn(),
}))

const REGISTERED = {
  id: 'account-1', username: 'wangteacher', display_name: '王老師', email: 'wang@example.edu',
  locale: 'zh-Hant', csrf_token: 'csrf', kind: 'registered', account_role: 'teacher', avatar_updated_at: null,
}
const GUEST = { ...REGISTERED, username: 'guest-1', display_name: '訪客小明', email: '', kind: 'guest', account_role: 'student' }

const replaceAccount = jest.fn()

function signedIn(account: object) {
  jest.mocked(useAuth).mockReturnValue({
    status: 'ready', account, replaceAccount, clearSession: jest.fn(), refresh: jest.fn(),
  } as unknown as ReturnType<typeof useAuth>)
}

function phone(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: (query: string) => ({
    matches, media: query, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true },
  }) })
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function open(path: string) {
  return render(<MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/" element={<p>home</p>} />
      <Route path="/account" element={<AccountSettingsPage />} />
      <Route path="/account/avatar" element={<AccountSubpage kind="avatar" />} />
      <Route path="/account/password" element={<AccountSubpage kind="password" />} />
      <Route path="/account/delete" element={<AccountSubpage kind="delete" />} />
    </Routes>
    <Where />
  </MemoryRouter>)
}

const where = () => screen.getByTestId('where').textContent

beforeEach(async () => {
  jest.clearAllMocks()
  phone(false)
  await applyLocale('zh-Hant')
  signedIn(REGISTERED)
  jest.mocked(checkAccountDeletion).mockResolvedValue({ can_delete: true, courses: [] })
})

describe('guests go back home', () => {
  test.each(['/account', '/account/avatar', '/account/password', '/account/delete'])('%s', path => {
    signedIn(GUEST)
    open(path)
    expect(where()).toBe('/')
  })
})

describe('on a computer the phone pages go back to /account', () => {
  test.each(['/account/avatar', '/account/password', '/account/delete'])('%s', path => {
    open(path)
    expect(where()).toBe('/account')
  })
})

describe('on a phone', () => {
  beforeEach(() => phone(true))

  test.each([
    ['/account/avatar', '更換個人圖片'],
    ['/account/password', '變更密碼'],
    ['/account/delete', '刪除帳號'],
  ])('%s is a page of its own', async (path, title) => {
    open(path)
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    expect(where()).toBe('/account')
  })

  test('變更密碼 opens the password page, and after updating the settings page says so', async () => {
    jest.mocked(api).mockResolvedValue({ status: 'PASSWORD_CHANGED' })
    open('/account')
    fireEvent.click(screen.getByRole('button', { name: '變更密碼' }))
    expect(where()).toBe('/account/password')

    fireEvent.change(screen.getByLabelText('目前密碼'), { target: { value: 'Socratic-123456' } })
    fireEvent.change(screen.getByLabelText('新密碼'), { target: { value: 'Another-654321' } })
    fireEvent.change(screen.getByLabelText('確認新密碼'), { target: { value: 'Another-654321' } })
    fireEvent.click(screen.getByRole('button', { name: '更新密碼' }))

    await waitFor(() => expect(where()).toBe('/account'))
    expect(screen.getByRole('status')).toHaveTextContent('密碼已更新')
  })

  test('刪除帳號 opens the delete page', () => {
    open('/account')
    fireEvent.click(screen.getByRole('button', { name: /刪除帳號/ }))
    expect(where()).toBe('/account/delete')
  })

  test('the language row opens a list from the bottom; picking one saves it and closes the list', async () => {
    jest.mocked(api).mockResolvedValue({ ...REGISTERED, locale: 'en' })
    open('/account')
    fireEvent.click(screen.getByRole('button', { name: /語言設定/ }))
    const sheet = screen.getByRole('dialog', { name: '語言設定' })
    // 一列一個按鈕（Tab 逐一走、Enter 選），目前的語言標 aria-current
    expect(within(sheet).queryAllByRole('radio')).toHaveLength(0)
    const options = within(sheet).getAllByRole('button').filter(button => button.textContent !== '取消')
    expect(options.map(option => option.textContent)).toEqual(['繁體中文', '简体中文', 'English', 'Español'])
    expect(options[0]).toHaveAttribute('aria-current', 'true')
    expect(options[2]).not.toHaveAttribute('aria-current')

    await act(async () => { fireEvent.click(within(sheet).getByRole('button', { name: 'English' })) })

    expect(api).toHaveBeenCalledWith('/account/locale', 'PUT', { locale: 'en' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  test('if saving the language fails the list stays open and says so', async () => {
    jest.mocked(api).mockRejectedValue(new Error('offline'))
    open('/account')
    fireEvent.click(screen.getByRole('button', { name: /語言設定/ }))

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'English' })) })

    const sheet = await screen.findByRole('dialog', { name: '語言設定' })
    expect(within(sheet).getByRole('alert')).toHaveTextContent('語言設定儲存失敗')
  })

  test('取消 closes the language list without saving', () => {
    open('/account')
    fireEvent.click(screen.getByRole('button', { name: /語言設定/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: '語言設定' })).getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api).not.toHaveBeenCalled()
  })
})

test('on a computer a failed language save is a form error', async () => {
  jest.mocked(api).mockRejectedValue(new Error('offline'))
  open('/account')
  await act(async () => { fireEvent.click(screen.getByRole('radio', { name: 'English' })) })
  expect(await screen.findByRole('alert')).toHaveTextContent('語言設定儲存失敗')
})
