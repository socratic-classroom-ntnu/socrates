import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Button, ButtonLink } from '..'

test('renders the variant class', () => {
  render(<Button variant="primary">送出</Button>)
  expect(screen.getByRole('button', { name: '送出' }).className).toMatch(/\bprimary\b/)
})

test('Button defaults to type=button', () => {
  render(<Button>取消</Button>)
  expect(screen.getByRole('button', { name: '取消' })).toHaveAttribute('type', 'button')
})

test('page className is appended after the component classes', () => {
  render(<Button variant="outline" type="submit" className="join-code__button">加入</Button>)
  const button = screen.getByRole('button', { name: '加入' })
  expect(button).toHaveAttribute('type', 'submit')
  expect(button.className.split(' ')).toEqual(['button', 'outline', 'join-code__button'])
})

test('ButtonLink renders a link with the variant class', () => {
  render(<MemoryRouter><ButtonLink variant="dark" to="/scan">掃描</ButtonLink></MemoryRouter>)
  const link = screen.getByRole('link', { name: '掃描' })
  expect(link).toHaveAttribute('href', '/scan')
  expect(link.className.split(' ')).toEqual(['button', 'dark'])
})
