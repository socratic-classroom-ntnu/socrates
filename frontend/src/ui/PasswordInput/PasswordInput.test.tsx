import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { PasswordInput } from '..'

test('starts hidden and the eye button toggles between showing and hiding the password', async () => {
  render(<label>密碼<PasswordInput defaultValue="secret-1" /></label>)
  const field = screen.getByLabelText('密碼')
  expect(field).toHaveAttribute('type', 'password')

  const show = screen.getByRole('button', { name: '顯示密碼' })
  expect(show).toHaveAttribute('aria-pressed', 'false')
  await act(() => userEvent.click(show))
  expect(field).toHaveAttribute('type', 'text')
  const hide = screen.getByRole('button', { name: '隱藏密碼' })
  expect(hide).toHaveAttribute('aria-pressed', 'true')

  await act(() => userEvent.click(hide))
  expect(field).toHaveAttribute('type', 'password')
})

test('the eye button never submits the form, and Enter in the field still does', async () => {
  const onSubmit = jest.fn((event: { preventDefault: () => void }) => event.preventDefault())
  render(<form onSubmit={onSubmit}><label>密碼<PasswordInput /></label></form>)
  await act(() => userEvent.click(screen.getByRole('button', { name: '顯示密碼' })))
  expect(onSubmit).not.toHaveBeenCalled()
  await act(() => userEvent.type(screen.getByLabelText('密碼'), 'abc{Enter}'))
  expect(onSubmit).toHaveBeenCalledTimes(1)
})

test('passes props and the ref through to the input', () => {
  const ref = createRef<HTMLInputElement>()
  render(<PasswordInput ref={ref} id="pw" maxLength={32} autoComplete="new-password" aria-invalid aria-describedby="rule" disabled />)
  const field = document.getElementById('pw')
  expect(ref.current).toBe(field)
  expect(field).toHaveAttribute('maxLength', '32')
  expect(field).toHaveAttribute('autoComplete', 'new-password')
  expect(field).toHaveAttribute('aria-invalid', 'true')
  expect(field).toHaveAttribute('aria-describedby', 'rule')
  expect(field).toBeDisabled()
  // 欄位停用時眼睛也停用，免得在送出中切換
  expect(screen.getByRole('button', { name: '顯示密碼' })).toBeDisabled()
})
