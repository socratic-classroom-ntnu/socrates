import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Auth, authErrorText } from './Auth'
import { ApiError, api, setCSRF } from './client'

jest.mock('./client', () => {
  const actual = jest.requireActual('./client')
  return { ApiError: actual.ApiError, api: jest.fn(), setCSRF: jest.fn() }
})

beforeEach(() => {
  api.mockReset()
  setCSRF.mockReset()
  history.replaceState({}, '', '/')
})

// 用「開頭」比對：提示文字（例如「找回密碼」）不該讓另一個欄位也被匹配到。
const fill = (label, value) =>
  fireEvent.change(screen.getByLabelText(new RegExp('^' + label)), { target: { value } })

// 這組測試釘住「改外觀不能改功能」：每個表單送出的端點與資料必須維持原樣。
test('login posts credentials, stores the CSRF token and hands the account over', async () => {
  const account = { username: 'siqi', csrf_token: 'csrf-1' }
  api.mockResolvedValue(account)
  const onLogin = jest.fn()
  render(<Auth onLogin={onLogin} />)

  fill('使用者名稱或 Email', 'siqi')
  fill('密碼', 'secret')
  fireEvent.click(screen.getByRole('button', { name: '推門進入 →' }))

  await waitFor(() => expect(onLogin).toHaveBeenCalledWith(account))
  expect(api).toHaveBeenCalledWith('/auth/login', 'POST', { login: 'siqi', password: 'secret' })
  expect(setCSRF).toHaveBeenCalledWith('csrf-1')
})

test('register posts username, email and password', async () => {
  const account = { username: 'siqi', csrf_token: 'csrf-2' }
  api.mockResolvedValue(account)
  const onLogin = jest.fn()
  render(<Auth onLogin={onLogin} />)

  fireEvent.click(screen.getByRole('button', { name: '註冊新帳號' }))
  fill('使用者名稱', 'siqi')
  fill('Email', 'siqi@example.test')
  fill('密碼', 'twelve-chars!')
  fireEvent.click(screen.getByRole('button', { name: '完成報到 →' }))

  await waitFor(() => expect(onLogin).toHaveBeenCalledWith(account))
  expect(api).toHaveBeenCalledWith('/auth/register', 'POST', {
    username: 'siqi',
    email: 'siqi@example.test',
    password: 'twelve-chars!',
  })
  expect(setCSRF).toHaveBeenCalledWith('csrf-2')
})

test('forgot password posts the email and confirms the mail was queued', async () => {
  api.mockResolvedValue({})
  render(<Auth onLogin={jest.fn()} />)

  fireEvent.click(screen.getByRole('button', { name: '忘記密碼' }))
  fill('Email', 'siqi@example.test')
  fireEvent.click(screen.getByRole('button', { name: '寄送重設信 →' }))

  expect(await screen.findByText('重設郵件已排入寄送；請查看信箱。')).toBeInTheDocument()
  expect(api).toHaveBeenCalledWith('/auth/forgot-password', 'POST', { email: 'siqi@example.test' })
})

test('reset link opens the new-password form and posts the token from the URL', async () => {
  history.replaceState({}, '', '/?reset_token=tok-9')
  api.mockResolvedValue({})
  render(<Auth onLogin={jest.fn()} />)

  fill('新密碼', 'twelve-chars!')
  fireEvent.click(screen.getByRole('button', { name: '更新密碼 →' }))

  expect(await screen.findByText('密碼已更新，請重新登入。')).toBeInTheDocument()
  expect(api).toHaveBeenCalledWith('/auth/reset-password', 'POST', {
    token: 'tok-9',
    password: 'twelve-chars!',
  })
  expect(location.search).toBe('')
  expect(screen.getByRole('button', { name: '推門進入 →' })).toBeInTheDocument()
})

test('verify link verifies the email on arrival', async () => {
  history.replaceState({}, '', '/?verify_token=tok-1')
  api.mockResolvedValue({})
  render(<Auth onLogin={jest.fn()} />)

  expect(await screen.findByText('Email 已驗證，請登入。')).toBeInTheDocument()
  expect(api).toHaveBeenCalledWith('/auth/verify', 'POST', { token: 'tok-1' })
  expect(location.search).toBe('')
})

test('a failed login shows the server message and keeps the form usable', async () => {
  api.mockRejectedValue(new ApiError(401, '請確認登入資料。'))
  const onLogin = jest.fn()
  render(<Auth onLogin={onLogin} />)

  fill('使用者名稱或 Email', 'siqi')
  fill('密碼', 'wrong')
  fireEvent.click(screen.getByRole('button', { name: '推門進入 →' }))

  expect(await screen.findByText('請確認登入資料。')).toBeInTheDocument()
  expect(onLogin).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: '推門進入 →' })).toBeEnabled()
})

test('error codes become readable text; unknown messages pass through untouched', () => {
  expect(authErrorText(new ApiError(403, 'ORIGIN_BINDING_REQUIRED'))).toMatch('網址')
  expect(authErrorText(new ApiError(422, [{ msg: 'x' }]))).toMatch('資料格式不符')
  expect(authErrorText(new ApiError(0, 'Network Error'))).toMatch('連不上伺服器')
  expect(authErrorText(new ApiError(503, 'x'))).toMatch('伺服器暫時')
  expect(authErrorText(new ApiError(429, '稍候即可再次送出。'))).toBe('稍候即可再次送出。')
})
