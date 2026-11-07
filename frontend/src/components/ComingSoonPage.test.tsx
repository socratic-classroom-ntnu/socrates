import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ComingSoonPage } from './ComingSoonPage'

test('shows entry-specific body and back link', () => {
  render(<MemoryRouter><ComingSoonPage body="學生名單之後會放在這裡。" backTo="/teach/courses/c-1" backLabel="回到活動" /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: '功能開發中' })).toBeInTheDocument()
  expect(screen.getByText('學生名單之後會放在這裡。')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '回到活動' })).toHaveAttribute('href', '/teach/courses/c-1')
  expect(screen.getByRole('main')).toBeInTheDocument()
})

test('defaults to the generic body and home link', () => {
  render(<MemoryRouter><ComingSoonPage /></MemoryRouter>)
  expect(screen.getByText('這個功能還在施工，之後會開放。')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '回到首頁' })).toHaveAttribute('href', '/')
})

test('panel variant has no main landmark', () => {
  render(<MemoryRouter><ComingSoonPage variant="panel" /></MemoryRouter>)
  expect(screen.queryByRole('main')).toBeNull()
  expect(screen.getByRole('heading', { name: '功能開發中' })).toBeInTheDocument()
})

test('custom title and illustration', () => {
  render(<MemoryRouter><ComingSoonPage title="暫時不支援手機操作" illustration="desktopOnly" /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: '暫時不支援手機操作' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '功能開發中' })).toBeNull()
  expect(document.querySelector('.desktop-only-illustration')).not.toBeNull()
  expect(document.querySelector('.construction-illustration')).toBeNull()
})
