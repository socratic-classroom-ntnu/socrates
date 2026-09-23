import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from '../testkit'
import Summary from './Summary'

const payload = {
  discussion_topic: '電車難題：選擇、責任與原則',
  core_principle: '降低可避免的傷害',
  key_points: ['人數會影響判斷', '介入方式也重要'],
  tension: '結果與責任之間的張力',
  reflection_excerpt: '我會轉向。',
  stage_outcomes: [{ index: 0, status: 'goal_met', title: '失控的電車' }],
}

describe('Summary issue #3', () => {
  it('renders topic, summary, key points and exits', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }))
    render(<MemoryRouter initialEntries={['/sessions/s1/summary']}><Routes><Route path="/sessions/:sessionId/summary" element={<Summary />} /></Routes></MemoryRouter>)
    expect(await screen.findByTestId('discussion-topic')).toHaveTextContent('電車難題')
    expect(screen.getByTestId('discussion-key-points')).toHaveTextContent('人數會影響判斷')
    expect(screen.getByTestId('summary-exit')).toBeInTheDocument()
  })
})
