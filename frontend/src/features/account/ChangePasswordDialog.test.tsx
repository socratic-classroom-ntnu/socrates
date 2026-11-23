import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ApiError, api } from '../../contract/classroomClient'
import { ChangePasswordDialog } from './ChangePasswordDialog'

jest.mock('../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../contract/classroomClient')>('../../contract/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn() }
})

const CURRENT = 'Socratic-123456'
const NEW = 'Another-654321'

function fill(current: string, next: string) {
  fireEvent.change(screen.getByLabelText('目前密碼'), { target: { value: current } })
  fireEvent.change(screen.getByLabelText('新密碼'), { target: { value: next } })
  fireEvent.change(screen.getByLabelText('確認新密碼'), { target: { value: next } })
  fireEvent.click(screen.getByRole('button', { name: '儲存新密碼' }))
}

beforeEach(() => jest.mocked(api).mockReset())

test('a wrong current password says so', async () => {
  jest.mocked(api).mockRejectedValue(new ApiError(400, 'CURRENT_PASSWORD_INVALID'))
  render(<ChangePasswordDialog onClose={jest.fn()} onSuccess={jest.fn()} />)

  fill(CURRENT, NEW)

  expect(await screen.findByText('目前密碼不正確')).toBeInTheDocument()
})

test('too many tries says to wait', async () => {
  jest.mocked(api).mockRejectedValue(new ApiError(429, 'PASSWORD_CHANGE_RATE_LIMITED'))
  render(<ChangePasswordDialog onClose={jest.fn()} onSuccess={jest.fn()} />)

  fill(CURRENT, NEW)

  expect(await screen.findByText('嘗試太多次，請稍後再試')).toBeInTheDocument()
})

test('the new password may be the current one', async () => {
  jest.mocked(api).mockResolvedValue({ status: 'PASSWORD_CHANGED' })
  const onSuccess = jest.fn()
  render(<ChangePasswordDialog onClose={jest.fn()} onSuccess={onSuccess} />)

  fill(CURRENT, CURRENT)

  await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  expect(api).toHaveBeenCalledWith('/account/password', 'PUT', { current_password: CURRENT, new_password: CURRENT })
})
