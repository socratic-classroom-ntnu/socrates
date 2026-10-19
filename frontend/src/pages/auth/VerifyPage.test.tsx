import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { ApiError, api } from '../../api/classroomClient'
import { AuthProvider } from '../../app/AuthContext'
import { AppRoutes } from '../../app/routes'
import { applyLocale } from '../../i18n'
import { readableText } from './testText'

jest.mock('../../api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../api/classroomClient')>('../../api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})
jest.mock('../../features/classroom-stage/Arena', () => ({ Arena: () => null }))
jest.mock('../GroupClassroom', () => ({ GroupClassroomGate: () => null }))
jest.mock('../ProviderSettings', () => ({ ProviderSettings: () => null }))

const pending = { id: 'u-1', username: 'Fizzy', email: 'mi@gmail.com', email_masked: 'mi•••@gmail.com', verified: false, csrf_token: 'csrf', locale: 'zh-Hant' }
const status = { verified: false, email_masked: 'mi•••@gmail.com', delivery: {} }

function openApp(url: string) {
  window.history.replaceState({}, '', url)
  render(<BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter>)
}
const here = () => window.location.pathname + window.location.search

beforeEach(() => jest.mocked(api).mockReset())

test('verifies token then continues to next', async () => {
  let verified = false
  jest.mocked(api).mockImplementation(async (url: string) => {
    if (url === '/auth/me') return { ...pending, verified }
    if (url === '/auth/verify') { verified = true; return { status: 'VERIFIED' } }
    return []
  })
  openApp('/verify?token=t-1&next=' + encodeURIComponent('/teacher/home?view=bank'))
  await waitFor(() => expect(api).toHaveBeenCalledWith('/auth/verify', 'POST', { token: 't-1' }))
  await waitFor(() => expect(here()).toBe('/teacher/home?view=bank'))
})

test('an anonymous visitor with a valid token is sent to log in', async () => {
  jest.mocked(api).mockImplementation(async (url: string) => {
    if (url === '/auth/me') throw new ApiError(401, 'LOGIN_REQUIRED')
    if (url === '/auth/verify') return { status: 'VERIFIED' }
    return []
  })
  openApp('/verify?token=t-1')
  await waitFor(() => expect(window.location.pathname).toBe('/login'))
})

test('an expired token explains itself in the current language', async () => {
  await applyLocale('es')
  jest.mocked(api).mockImplementation(async (url: string) => {
    if (url === '/auth/me') throw new ApiError(401, 'LOGIN_REQUIRED')
    if (url === '/auth/verify') throw new ApiError(400, 'AUTH_TOKEN_INVALID')
    return []
  })
  openApp('/verify?token=old')
  expect(await screen.findByText('Este enlace de verificación ya no es válido. Pide uno nuevo.')).toBeInTheDocument()
  expect(readableText(screen.getByRole('main'))).not.toMatch(/[\u3400-\u9fff]/)
})

test('the waiting card shows the masked email and resends with a cooldown', async () => {
  jest.mocked(api).mockImplementation(async (url: string) => {
    if (url === '/auth/me') return pending
    if (url === '/auth/verification-status') return status
    if (url === '/auth/verification-email') return { status: 'QUEUED' }
    return []
  })
  openApp('/verify')
  expect(await screen.findByText(/mi•••@gmail\.com/)).toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '重新寄送驗證信' })) })
  expect(api).toHaveBeenCalledWith('/auth/verification-email', 'POST', { email: 'mi@gmail.com' })
  expect(screen.getByRole('button', { name: /秒後可再次寄送/ })).toBeDisabled()
})

// 後端的節流訊息是中文句子；新頁只看狀態碼，顯示自己的翻譯
test('resend respects cooldown error code', async () => {
  jest.mocked(api).mockImplementation(async (url: string) => {
    if (url === '/auth/me') return pending
    if (url === '/auth/verification-status') return status
    if (url === '/auth/verification-email') throw new ApiError(429, '稍候即可再次送出。')
    return []
  })
  openApp('/verify')
  const button = await screen.findByRole('button', { name: '重新寄送驗證信' })
  await act(async () => { fireEvent.click(button) })
  expect(screen.getByRole('status')).toHaveTextContent('操作太頻繁，請稍候再試。')
  expect(screen.queryByText('稍候即可再次送出。')).toBeNull()
})

test('checking again while still unverified says so', async () => {
  jest.mocked(api).mockImplementation(async (url: string) => {
    if (url === '/auth/me') return pending
    if (url === '/auth/verification-status') return status
    return []
  })
  openApp('/verify')
  const button = await screen.findByRole('button', { name: '我已經驗證了' })
  await act(async () => { fireEvent.click(button) })
  expect(screen.getByRole('status')).toHaveTextContent('還沒有完成驗證')
})

test('local fixture mail shows the verification link so developers can verify without an inbox', async () => {
  jest.mocked(api).mockImplementation(async (url: string) => {
    if (url === '/auth/me') return pending
    if (url === '/auth/verification-status') return { ...status, delivery: { preview_url: 'http://localhost:5173/?verify_token=abc' } }
    return []
  })
  openApp('/verify')
  expect(await screen.findByRole('link', { name: '本機測試：開啟這次的驗證連結' })).toHaveAttribute('href', 'http://localhost:5173/?verify_token=abc')
})
