import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from '../testkit'
import Summary from './Summary'

const payload = {
  core_principle: '降低可避免的傷害',
  stage_outcomes: [
    {
      index: 0,
      status: 'goal_met',
      title: '失控的電車',
    },
  ],
}

describe('Summary page', () => {
  it('renders summary and opens question details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => payload,
      })
    )

    render(
      <MemoryRouter initialEntries={['/sessions/s1/summary']}>
        <Routes>
          <Route
            path="/sessions/:sessionId/summary"
            element={<Summary />}
          />
        </Routes>
      </MemoryRouter>
    )

    expect(
      await screen.findByText('今日課堂總結')
    ).toBeInTheDocument()

    expect(
      screen.getByText('降低可避免的傷害')
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /失控的電車/ }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('統計圖表')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '關閉' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})