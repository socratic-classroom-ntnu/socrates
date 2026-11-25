import { fireEvent, render } from '@testing-library/react'
import { Avatar } from './Avatar'

test('shows the picture when there is one', () => {
  const { container } = render(<Avatar name="learner" src="/api/v2/account/avatar?v=1" />)

  expect(container.querySelector('img')).toHaveAttribute('src', '/api/v2/account/avatar?v=1')
})

test('falls back to the first letter when the picture fails to load', () => {
  const { container } = render(<Avatar name="learner" src="/api/v2/account/avatar?v=1" />)

  fireEvent.error(container.querySelector('img')!)

  expect(container.querySelector('img')).toBeNull()
  expect(container).toHaveTextContent('L')
})

test('a new picture is tried again after an earlier one failed', () => {
  const { container, rerender } = render(<Avatar name="learner" src="/api/v2/account/avatar?v=1" />)
  fireEvent.error(container.querySelector('img')!)

  rerender(<Avatar name="learner" src="/api/v2/account/avatar?v=2" />)

  expect(container.querySelector('img')).toHaveAttribute('src', '/api/v2/account/avatar?v=2')
})

test('without a picture it is the first letter', () => {
  const { container } = render(<Avatar name="learner" />)

  expect(container.querySelector('img')).toBeNull()
  expect(container).toHaveTextContent('L')
})
