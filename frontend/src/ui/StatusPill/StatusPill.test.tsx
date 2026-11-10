import { render, screen } from '@testing-library/react'
import { StatusPill } from '..'

test('renders the tone class', () => {
  render(<StatusPill tone="scheduled">已排程</StatusPill>)
  expect(screen.getByText('已排程').className.split(' ')).toEqual(['pill', 'scheduled'])
})
