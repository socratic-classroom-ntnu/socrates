import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ApiError, api } from '../../contract/classroomClient'
import { ChangePasswordDialog } from './ChangePasswordDialog'

jest.mock('../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../contract/classroomClient')>('../../contract/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn() }
})

const CURRENT = 'Socratic-123456'
const NEW = 'Another-654321'

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

function fill(current: string, next: string, confirm = next) {
  type('目前密碼', current)
  type('新密碼', next)
  type('確認新密碼', confirm)
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: '更新密碼' }))
}

function errorOf(label: string) {
  const field = screen.getByLabelText(label)
  const id = field.getAttribute('aria-describedby')
  return id ? document.getElementById(id.split(' ')[0])?.textContent : undefined
}

beforeEach(() => jest.mocked(api).mockReset())

test('opens as a dialog titled 變更密碼', () => {
  render(<ChangePasswordDialog onClose={jest.fn()} onSuccess={jest.fn()} />)
  expect(screen.getByRole('dialog', { name: '變更密碼' })).toBeInTheDocument()
})

test('lists the three password rules and ticks the ones the new password meets', () => {
  render(<ChangePasswordDialog onClose={jest.fn()} onSuccess={jest.fn()} />)
  const rules = screen.getByRole('list', { name: '新密碼規則' })
  expect(within(rules).getAllByRole('listitem')).toHaveLength(3)

  type('新密碼', 'abcdefgh')

  expect(within(rules).getByText('8–32 個字元').closest('li')).toHaveAttribute('data-met', 'true')
  expect(within(rules).getByText('包含英文大寫與小寫').closest('li')).toHaveAttribute('data-met', 'false')
  expect(within(rules).getByText('包含數字與特殊符號').closest('li')).toHaveAttribute('data-met', 'false')
})

test('the update button stays off until all rules pass and the confirmation matches', () => {
  render(<ChangePasswordDialog onClose={jest.fn()} onSuccess={jest.fn()} />)
  const update = screen.getByRole('button', { name: '更新密碼' })

  fill(CURRENT, 'abcdefg1!')
  expect(update).toBeDisabled()

  fill(CURRENT, NEW, NEW + 'x')
  expect(update).toBeDisabled()

  fill(CURRENT, NEW)
  expect(update).toBeEnabled()
})

test('a different confirmation marks the confirmation field', () => {
  render(<ChangePasswordDialog onClose={jest.fn()} onSuccess={jest.fn()} />)

  fill(CURRENT, NEW, NEW + 'x')

  expect(screen.getByLabelText('確認新密碼')).toHaveAttribute('aria-invalid', 'true')
  expect(errorOf('確認新密碼')).toBe('兩次輸入的新密碼不一樣')
})

test('a wrong current password marks the current password field', async () => {
  jest.mocked(api).mockRejectedValue(new ApiError(400, 'CURRENT_PASSWORD_INVALID'))
  render(<ChangePasswordDialog onClose={jest.fn()} onSuccess={jest.fn()} />)

  fill(CURRENT, NEW)
  submit()

  await waitFor(() => expect(screen.getByLabelText('目前密碼')).toHaveAttribute('aria-invalid', 'true'))
  expect(errorOf('目前密碼')).toBe('目前密碼不正確')
})

test('a new password the server rejects is explained under the new password field', async () => {
  jest.mocked(api).mockRejectedValue(new ApiError(422, [{
    type: 'password_policy',
    loc: ['body', 'new_password'],
    msg: 'Password must be 8-32 characters',
    input: 'Another 654321!',
  }]))
  render(<ChangePasswordDialog onClose={jest.fn()} onSuccess={jest.fn()} />)

  fill(CURRENT, NEW)
  submit()

  await waitFor(() => expect(screen.getByLabelText('新密碼')).toHaveAttribute('aria-invalid', 'true'))
  expect(errorOf('新密碼')).toMatch(/不能有空白/)
  expect(document.body.textContent).not.toContain('[object Object]')
  expect(document.body.textContent).not.toContain('Password must be')
})

test('too many tries says to wait', async () => {
  jest.mocked(api).mockRejectedValue(new ApiError(429, 'PASSWORD_CHANGE_RATE_LIMITED'))
  render(<ChangePasswordDialog onClose={jest.fn()} onSuccess={jest.fn()} />)

  fill(CURRENT, NEW)
  submit()

  expect(await screen.findByText('嘗試太多次，請稍後再試')).toBeInTheDocument()
})

test('the new password may be the current one', async () => {
  jest.mocked(api).mockResolvedValue({ status: 'PASSWORD_CHANGED' })
  const onSuccess = jest.fn()
  render(<ChangePasswordDialog onClose={jest.fn()} onSuccess={onSuccess} />)

  fill(CURRENT, CURRENT)
  submit()

  await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  expect(api).toHaveBeenCalledWith('/account/password', 'PUT', { current_password: CURRENT, new_password: CURRENT })
})

test('as a phone page it has a title, a back button and the actions at the bottom', () => {
  const onClose = jest.fn()
  render(<ChangePasswordDialog variant="page" onClose={onClose} onSuccess={jest.fn()} />)

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1, name: '變更密碼' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '更新密碼' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '返回' }))
  expect(onClose).toHaveBeenCalled()
})

test('the phone action bar keeps the feedback button above it', () => {
  render(<ChangePasswordDialog variant="page" onClose={jest.fn()} onSuccess={jest.fn()} />)
  expect(screen.getByRole('button', { name: '更新密碼' }).closest('[data-feedback-avoid]')).not.toBeNull()
})
