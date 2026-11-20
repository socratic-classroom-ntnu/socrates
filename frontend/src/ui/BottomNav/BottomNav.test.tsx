import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BottomNav } from '..'

test('links and buttons share one bar; the current link and an open button are marked', () => {
  const onSelect = jest.fn()
  render(<MemoryRouter><BottomNav label="主選單" items={[
    { key: 'home', label: '首頁', icon: <svg />, to: '/', current: true },
    { key: 'me', label: '我', icon: <svg />, onSelect, expanded: false },
  ]} /></MemoryRouter>)
  const nav = screen.getByRole('navigation', { name: '主選單' })
  expect(within(nav).getByRole('link', { name: '首頁' })).toHaveAttribute('aria-current', 'page')
  const me = within(nav).getByRole('button', { name: '我' })
  expect(me).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(me)
  expect(onSelect).toHaveBeenCalled()
})

test('an open button reads as current too', () => {
  render(<MemoryRouter><BottomNav label="主選單" items={[
    { key: 'home', label: '首頁', icon: <svg />, to: '/' },
    { key: 'me', label: '我', icon: <svg />, onSelect: () => {}, expanded: true },
  ]} /></MemoryRouter>)
  expect(screen.getByRole('link', { name: '首頁' })).not.toHaveAttribute('aria-current')
  expect(screen.getByRole('button', { name: '我' })).toHaveAttribute('aria-expanded', 'true')
})
