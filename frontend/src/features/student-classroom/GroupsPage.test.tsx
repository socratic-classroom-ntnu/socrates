import { act, fireEvent, screen } from '@testing-library/react'
import { Route } from 'react-router-dom'
import { AppShell } from '../../app/AppShell'
import { mockApi, renderAt, signedIn, signedInTeacher } from '../../testing/pageHarness'
import { GroupsPage } from './GroupsPage'

jest.mock('../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../contract/classroomClient')>('../../contract/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})
jest.mock('../ai-settings/ProviderSettings', () => ({ ProviderSettings: () => <p>provider-settings</p> }))

// 分組課頁包在側欄外框裡：外框已經有帳號與登出
function openGroups(url = '/groups') {
  window.history.replaceState({}, '', url)
  return renderAt(url, '/unused', null, <Route element={<AppShell />}><Route path="/groups" element={<GroupsPage />} /></Route>)
}

async function openAccountMenu() {
  await act(async () => { fireEvent.click(await screen.findByRole('button', { name: '帳號選單' })) })
}

beforeEach(() => {
  mockApi({ 'GET /classrooms': [] })
})

afterEach(() => window.history.replaceState({}, '', '/'))

test('inside the shell the join door has no second account bar', async () => {
  openGroups()
  expect(await screen.findByRole('form', { name: '加入課堂' })).toBeInTheDocument()
  await openAccountMenu()
  expect(screen.getAllByText('登出')).toHaveLength(1)
  expect(screen.queryByRole('navigation', { name: '帳號與其他入口' })).toBeNull()
  expect(screen.queryByText('單人練習')).toBeNull()
})

test('inside the shell the AI settings view has no second top bar', async () => {
  openGroups('/groups?view=providers')
  expect(await screen.findByText('provider-settings')).toBeInTheDocument()
  expect(screen.queryByText('共思教室')).toBeNull()
  expect(screen.queryByRole('button', { name: '加入與近期課堂' })).toBeNull()
})

test('teachers reach the group-class desk from the groups page', async () => {
  mockApi({ 'GET /classrooms': [], 'GET /auth/me': signedInTeacher })
  openGroups()
  expect(await screen.findByRole('link', { name: '管理分組課（教師端）' })).toHaveAttribute('href', '/teacher/home')
})

// P30：分組課頁上方的教師端連結只給老師帳號
test.each([
  [signedInTeacher, true],
  [signedIn, false],
])('the teacher link shows only for a teacher account', async (account, shown) => {
  mockApi({ 'GET /classrooms': [], 'GET /auth/me': account })
  openGroups()
  expect(await screen.findByRole('form', { name: '加入課堂' })).toBeInTheDocument()
  expect(!!screen.queryByRole('link', { name: '管理分組課（教師端）' })).toBe(shown)
})

// 訪客沒有 Email 可驗證，也進不了分組課（後端對訪客一律擋）：手打 /groups 不能停在「驗證連結會寄到 。」的空白驗證閘門
test('a guest has no email to verify, so the groups page sends it home instead of the verification gate', async () => {
  const guest = { ...signedIn, id: 'g-1', username: '安靜的燕子-9457630c', display_name: '安靜的燕子', kind: 'guest', email: '', email_masked: '', verified: false }
  mockApi({ 'GET /auth/me': guest })
  openGroups()
  expect(await screen.findByText('other-page')).toBeInTheDocument()
  expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/)
  expect(screen.queryByText('完成 Email 驗證')).toBeNull()
})
