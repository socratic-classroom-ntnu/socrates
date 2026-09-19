import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import Conversation from './Conversation'

const detail = {
  session: {
    id: 's1', status: 'active', flow_state: 'active_in_stage',
    current_stage_index: 0, total_stages: 3,
  },
  stage: { index: 0, key: 'trolley_basic', title: '失控的電車', opening_statement: '一輛電車…' },
  messages: [{ seq: 0, role: 'tutor', content: '一輛電車…' }],
  available_actions: ['send_message', 'end'],
  summary: null,
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/sessions/s1']}>
      <Routes>
        <Route path="/sessions/:sessionId" element={<Conversation />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Conversation', () => {
  it('顯示進度的數量，但不顯示未進入情境的名稱', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => detail }))
    renderPage()
    expect(await screen.findByText('情境 1 / 3')).toBeInTheDocument()
    expect(screen.queryByText(/天橋/)).not.toBeInTheDocument()
  })

  it('依 available_actions 顯示結束鈕', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => detail }))
    renderPage()
    expect(await screen.findByRole('button', { name: '結束討論' })).toBeInTheDocument()
  })

  it('重新整理後仍能依後端狀態顯示重試鈕', async () => {
    const pending = {
      ...detail,
      messages: [...detail.messages, { seq: 1, role: 'student', content: '我的發言' }],
      available_actions: ['retry', 'end'],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => pending }))
    renderPage()
    expect(await screen.findByRole('button', { name: '重試' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '你的回應' })).not.toBeInTheDocument()
  })

  it('送出等待期間不接受會被成功回應清掉的新草稿', async () => {
    let finishPost!: (value: unknown) => void
    const pendingPost = new Promise((resolve) => { finishPost = resolve })
    const fetchMock = vi.fn((_path: string, init?: RequestInit) => {
      if (init?.method === 'POST') return pendingPost
      return Promise.resolve({ ok: true, json: async () => detail })
    })
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    const input = await screen.findByRole('textbox', { name: '你的回應' })
    fireEvent.change(input, { target: { value: '已送出的想法' } })
    fireEvent.click(screen.getByRole('button', { name: '送出' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(input).toBeDisabled()

    finishPost({ ok: true, json: async () => detail })
    await waitFor(() => expect(input).not.toBeDisabled())
    expect(input).toHaveValue('')
  })

  it('已儲存發言在重試成功後不殘留為可再次送出的草稿', async () => {
    const pending = {
      ...detail,
      messages: [...detail.messages, { seq: 1, role: 'student', content: '已儲存的想法' }],
      available_actions: ['retry', 'end'],
    }
    const replied = {
      ...detail,
      messages: [...pending.messages, { seq: 2, role: 'tutor', content: '請再說明。' }],
    }
    let current = detail
    vi.stubGlobal('fetch', vi.fn((_path: string, init?: RequestInit) => {
      if (init?.method === 'POST' && _path.endsWith('/messages')) {
        current = pending
        return Promise.resolve({ ok: false, status: 503 })
      }
      if (init?.method === 'POST' && _path.endsWith('/retry')) {
        current = replied
        return Promise.resolve({ ok: true, json: async () => replied })
      }
      return Promise.resolve({ ok: true, json: async () => current })
    }))
    renderPage()

    const input = await screen.findByRole('textbox', { name: '你的回應' })
    fireEvent.change(input, { target: { value: '已儲存的想法' } })
    fireEvent.click(screen.getByRole('button', { name: '送出' }))
    fireEvent.click(await screen.findByRole('button', { name: '重試' }))
    expect(await screen.findByRole('textbox', { name: '你的回應' })).toHaveValue('')
  })
})
