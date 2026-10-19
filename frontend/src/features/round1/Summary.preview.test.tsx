import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Summary from './Summary'

describe('Summary preview page', () => {
  it('renders the fixed preview and opens question details', async () => {
    window.history.replaceState({}, '', '/sessions/s1/summary?preview=1')
    render(
      <MemoryRouter initialEntries={['/sessions/s1/summary?preview=1']}>
        <Routes>
          <Route path="/sessions/:sessionId/summary" element={<Summary/>}/>
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('今日課堂總結')).toBeInTheDocument()
    expect(screen.getByText('做決定時，不只要考慮結果，也要思考自己的原則，以及對他人的影響。')).toBeInTheDocument()
    expect(screen.getByText('討論重點')).toBeInTheDocument()
    expect(screen.getByText('討論中的分歧')).toBeInTheDocument()
    expect(screen.getByText('我的反思摘錄')).toBeInTheDocument()
    expect(screen.getByTestId('summary-exit')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /討論情境 1/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('統計圖表')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '關閉' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
