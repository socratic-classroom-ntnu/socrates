import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import History from './History'
import { listSessions } from '../../contract/client'

jest.mock('../../contract/client', () => {
  const actual = jest.requireActual<typeof import('../../contract/client')>('../../contract/client')
  return { ...actual, listSessions: jest.fn() }
})

function Where() { return <output data-testid="where">{useLocation().pathname}</output> }

// 歷史紀錄的「回到首頁」回 Round 1 首頁，而且網址是 /round1：重新整理後仍是同一頁，不會變成共思教室首頁
test('History 回到首頁 lands on the Round 1 home with a reload-safe URL', async () => {
  jest.mocked(listSessions).mockResolvedValue({ items: [], next_cursor: null })
  render(<MemoryRouter initialEntries={['/history']}><Routes>
    <Route path="/history" element={<History />}/>
    <Route path="/round1" element={<p>Round 1 首頁</p>}/>
    <Route path="/" element={<p>只在本路由器存在的 "/"</p>}/>
  </Routes><Where/></MemoryRouter>)
  await waitFor(() => expect(listSessions).toHaveBeenCalled())

  fireEvent.click(screen.getByRole('button', { name: '回到首頁' }))
  expect(await screen.findByText('Round 1 首頁')).toBeInTheDocument()
  expect(screen.getByTestId('where')).toHaveTextContent('/round1')
})
