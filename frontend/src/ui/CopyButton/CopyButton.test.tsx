import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CopyButton } from '..'

test('icon-only copy button uses the label as its name and reports the result', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined)
  Object.assign(navigator, { clipboard: { writeText } })
  render(<CopyButton text="ABC123" label="複製代碼" iconOnly tone="quiet" />)
  const button = screen.getByRole('button', { name: '複製代碼' })
  expect(button.className.split(' ')).toEqual(['iconButton', 'quiet'])
  await act(() => userEvent.click(button))
  expect(writeText).toHaveBeenCalledWith('ABC123')
  expect(await screen.findByRole('status')).toBeInTheDocument()
})

test('text copy button takes the button variant', () => {
  render(<CopyButton text="https://x" label="複製連結" variant="outline" />)
  expect(screen.getByRole('button', { name: '複製連結' }).className.split(' ')).toEqual(['button', 'outline'])
})

test('unstyled copy button only carries the page class', () => {
  render(<CopyButton text="ABC123" label="複製代碼" iconOnly unstyled className="chalk-card__copy" />)
  expect(screen.getByRole('button', { name: '複製代碼' }).className).toBe('chalk-card__copy')
})
