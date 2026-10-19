import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ApiError, api } from '../api/classroomClient'
import { TeacherShell } from '../pages/TeacherDashboard'
import { AppShell } from './AppShell'
import { AuthProvider, useAuth } from './AuthContext'

jest.mock('../api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../api/classroomClient')>('../api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})

let serverLocale = 'zh-Hant'
let auth: ReturnType<typeof useAuth>

function Where() {
  const { pathname, search } = useLocation()
  auth = useAuth()
  return <output data-testid="where">{pathname + search}</output>
}

function open(url: string, page = <p>page-body</p>) {
  render(<MemoryRouter initialEntries={[url]}>
    <AuthProvider>
      <Routes>
        <Route element={<AppShell />}><Route path="*" element={page} /></Route>
        <Route path="/login" element={<p>login-page</p>} />
      </Routes>
      <Where />
    </AuthProvider>
  </MemoryRouter>)
}

beforeEach(() => {
  serverLocale = 'zh-Hant'
  jest.mocked(api).mockReset()
  jest.mocked(api).mockImplementation(async (url: string, method?: string, body?: Record<string, unknown>) => {
    const account = () => ({ id: 'u-1', username: 'Fizzy', verified: true, csrf_token: 'c', locale: serverLocale })
    if (url === '/auth/me') return account()
    if (url === '/account/locale' && method === 'PUT') { serverLocale = String(body.locale); return account() }
    if (url === '/auth/logout') return {}
    return []
  })
})

test('marks current nav item', async () => {
  open('/teacher/home?view=store')
  const store = await screen.findByRole('link', { name: '題庫商店' })
  expect(store).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: '我教的課' })).not.toHaveAttribute('aria-current')
  expect(screen.getByRole('link', { name: '首頁' })).not.toHaveAttribute('aria-current')
})

test.each([
  ['/', '首頁'],
  ['/teacher/home', '我教的課'],
  ['/teacher/courses/c1', '我教的課'],
  ['/teacher/home?view=bank', '個人題庫'],
  ['/teacher/home?view=settings', 'AI 連線設定'],
])('%s highlights %s', async (url, label) => {
  open(url)
  expect(await screen.findByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
})

test('shows the signed-in user and the page body', async () => {
  open('/')
  expect(await screen.findByText('Fizzy')).toBeInTheDocument()
  expect(screen.getByText('page-body')).toBeInTheDocument()
})

test('switching language updates nav labels and saves account locale', async () => {
  open('/teacher/home')
  fireEvent.change(await screen.findByLabelText('語言'), { target: { value: 'es' } })
  expect(await screen.findByRole('link', { name: 'Tienda de preguntas' })).toBeInTheDocument()
  await waitFor(() => expect(api).toHaveBeenCalledWith('/account/locale', 'PUT', { locale: 'es' }))
  await waitFor(() => expect(auth.account.locale).toBe('es'))
})

test('failed account locale update restores the server locale and explains the failure', async () => {
  jest.mocked(api).mockImplementation(async (url: string, method?: string) => {
    if (url === '/auth/me') return { id: 'u-1', username: 'Fizzy', verified: true, csrf_token: 'c', locale: 'zh-Hant' }
    if (url === '/account/locale' && method === 'PUT') throw new ApiError(500, 'LOCALE_SAVE_FAILED')
    return []
  })
  open('/teacher/home')

  fireEvent.change(await screen.findByLabelText('語言'), { target: { value: 'es' } })

  expect(await screen.findByRole('alert')).toHaveTextContent('伺服器暫時無法處理，請稍後再試。')
  expect(document.documentElement.lang).toBe('zh-Hant')
  expect(localStorage.getItem('socrates.locale')).toBe('zh-Hant')
  expect(screen.getByRole('link', { name: '題庫商店' })).toBeInTheDocument()
  expect(auth.account.locale).toBe('zh-Hant')
})

test('refresh after switching does not revert locale', async () => {
  open('/teacher/home')
  fireEvent.change(await screen.findByLabelText('語言'), { target: { value: 'en' } })
  await waitFor(() => expect(auth.account.locale).toBe('en'))
  await act(async () => { await auth.refresh() })
  expect(document.documentElement.lang).toBe('en')
  expect(screen.getByRole('link', { name: 'Question store' })).toBeInTheDocument()
})

test('logout goes to login', async () => {
  open('/teacher/home')
  const logout = await screen.findByRole('button', { name: '登出' })
  await act(async () => { fireEvent.click(logout) })
  expect(api).toHaveBeenCalledWith('/auth/logout', 'POST')
  await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login'))
})

test('legacy teacher page renders without its own sidebar', async () => {
  open('/teacher/home?view=bank', <TeacherShell active="bank"><p>bank-body</p></TeacherShell>)
  expect(await screen.findByText('bank-body')).toBeInTheDocument()
  expect(document.querySelector('nav[aria-label="教師端"]')).toBeNull()
  expect(screen.getAllByRole('navigation')).toHaveLength(1)
})

test('a teacher page outside the shell keeps its own sidebar', () => {
  render(<MemoryRouter><TeacherShell active="bank"><p>bank-body</p></TeacherShell></MemoryRouter>)
  expect(document.querySelector('nav[aria-label="教師端"]')).not.toBeNull()
})
