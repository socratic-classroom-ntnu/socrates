import { render, screen } from '@testing-library/react'
import { FormError } from '..'

test('passes role and id through', () => {
  render(<FormError role="alert" id="save-error">儲存失敗</FormError>)
  expect(screen.getByRole('alert')).toHaveTextContent('儲存失敗')
  expect(screen.getByRole('alert')).toHaveAttribute('id', 'save-error')
})
