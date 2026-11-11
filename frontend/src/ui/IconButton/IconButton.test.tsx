import { render, screen } from '@testing-library/react'
import { IconButton } from '..'

test('label becomes the accessible name and type defaults to button', () => {
  render(<IconButton label="更多動作" tone="quiet"><svg aria-hidden="true" /></IconButton>)
  const button = screen.getByRole('button', { name: '更多動作' })
  expect(button).toHaveAttribute('type', 'button')
  expect(button.className.split(' ')).toEqual(['iconButton', 'quiet'])
})
