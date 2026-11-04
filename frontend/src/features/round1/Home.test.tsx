import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Home from './Home'
import { listSessions } from '../../contract/client'

jest.mock('../../contract/client', () => {
  const actual = jest.requireActual<typeof import('../../contract/client')>('../../contract/client')
  return { ...actual, listSessions: jest.fn(), createSession: jest.fn() }
})

// 單人對話首頁（照見你的立場）要能回到共思教室首頁，不必重新整理
test('the Round 1 page header links back to the classroom home with a full page load', async () => {
  jest.mocked(listSessions).mockResolvedValue({ items: [], next_cursor: null })
  jest.spyOn(console, 'error').mockImplementation(() => undefined) // jsdom 不實作整頁導覽
  render(<MemoryRouter initialEntries={['/round1']}><Routes>
    <Route path="/round1" element={<Home />}/>
    <Route path="/" element={<p>本頁路由器的首頁</p>}/>
  </Routes></MemoryRouter>)
  await waitFor(() => expect(listSessions).toHaveBeenCalled())

  const link = screen.getByRole('link', { name: '回首頁' })
  expect(link).toHaveAttribute('href', '/')
  expect(link.closest('header')).toHaveTextContent('Socrates · Round 1')
  expect(screen.getByRole('heading', { name: '照見你的立場' })).toBeInTheDocument()
  // 不能被本頁路由器攔下（那只會留在 Round 1 畫面）；交給瀏覽器整頁載入教室首頁，登入 cookie 保留
  expect(fireEvent.click(link)).toBe(true)
  expect(screen.queryByText('本頁路由器的首頁')).toBeNull()
})
