import { act, render, screen, waitFor } from '@testing-library/react'
import { api, setCSRF } from '../api/classroomClient'
import { applyLocale } from '../i18n'
import { AuthProvider, useAuth } from './AuthContext'

jest.mock('../api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../api/classroomClient')>('../api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})

const base = { id: 'u-1', username: 'Fizzy', verified: true, csrf_token: 'csrf-1' }
let auth: ReturnType<typeof useAuth>

function Probe() {
  auth = useAuth()
  return <p data-testid="probe">{auth.status}:{auth.account?.locale ?? 'none'}</p>
}

beforeEach(() => jest.mocked(api).mockReset())

test('an account preference wins over the browser language and sets the csrf token', async () => {
  jest.mocked(api).mockResolvedValue({ ...base, locale: 'es' })
  render(<AuthProvider><Probe /></AuthProvider>)
  await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('ready:es'))
  expect(setCSRF).toHaveBeenCalledWith('csrf-1')
  expect(document.documentElement.lang).toBe('es')
})

// 新帳號還沒有偏好：把登入前已經在用的語言寫進帳號，並用回應更新 context，避免之後 refresh 又變回 null
test('a first sign-in stores the current language on the account', async () => {
  await applyLocale('en')
  jest.mocked(api).mockImplementation(async (url: string, method?: string) => {
    if (url === '/auth/me') return { ...base, locale: null }
    if (url === '/account/locale' && method === 'PUT') return { ...base, locale: 'en' }
    throw new Error('unexpected ' + url)
  })
  render(<AuthProvider><Probe /></AuthProvider>)
  await waitFor(() => expect(api).toHaveBeenCalledWith('/account/locale', 'PUT', { locale: 'en' }))
  await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('ready:en'))
})

test('signing out returns to anonymous', async () => {
  jest.mocked(api).mockResolvedValue({ ...base, locale: 'zh-Hant' })
  render(<AuthProvider><Probe /></AuthProvider>)
  await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('ready:zh-Hant'))
  await act(async () => { await auth.signOut() })
  expect(api).toHaveBeenCalledWith('/auth/logout', 'POST')
  expect(screen.getByTestId('probe')).toHaveTextContent('anonymous:none')
})
