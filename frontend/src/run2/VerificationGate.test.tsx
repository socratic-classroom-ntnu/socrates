import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { VerificationGate } from './VerificationGate'
import { api } from './client'

jest.mock('./client', () => ({ api: jest.fn() }))

beforeEach(() => {
  jest.mocked(api).mockReset()
  history.replaceState({}, '', '/')
})

test('restricted session shows delivery status and resend', async () => {
  jest.mocked(api).mockImplementation((path, method) => {
    if (path === '/auth/verification-status') {
      return Promise.resolve({
        verified: false,
        email_masked: 'ar•••@example.test',
        delivery: {
          provider: 'fixture',
          provider_message_id: 'fixture-mail-1',
          provider_status: 'ACCEPTED',
        },
      })
    }
    if (path === '/auth/verification-email' && method === 'POST') {
      return Promise.resolve({ status: 'REQUEST_RECORDED' })
    }
    return Promise.resolve({})
  })

  render(
    <VerificationGate
      user={{ email: 'arthur@example.test' }}
      onVerified={jest.fn()}
    />,
  )

  expect(await screen.findByText('Email Provider 已接收')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '重新寄送驗證信' }))
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('/auth/verification-email', 'POST', {
      email: 'arthur@example.test',
    }),
  )
  expect(await screen.findByText('新的驗證信已排入寄送。')).toBeInTheDocument()
})

test('local fixture exposes the current verification link', async () => {
  jest.mocked(api).mockResolvedValue({
    verified: false,
    email_masked: 'ar•••@example.test',
    delivery: {
      provider_status: 'ACCEPTED',
      preview_url: 'http://127.0.0.1:18980/?verify_token=fixture',
    },
  })
  render(
    <VerificationGate
      user={{ email: 'arthur@example.test' }}
      onVerified={jest.fn()}
    />,
  )
  const link = await screen.findByRole('link', {
    name: 'Local fixture：開啟本次驗證連結',
  })
  expect(link).toHaveAttribute(
    'href',
    'http://127.0.0.1:18980/?verify_token=fixture',
  )
})
