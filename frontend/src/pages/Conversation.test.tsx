import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import Conversation from './Conversation'

const detail = {
  session: {
    id: 's1', status: 'active', flow_state: 'active_in_stage',
    current_stage_index: 0, total_stages: 3, end_reason: null,
  },
  stage: { index: 0, key: 'trolley_basic', title: '失控的電車', opening_statement: '一輛電車…' },
  messages: [{ seq: 0, role: 'tutor', content: '一輛電車…' }],
  available_actions: ['send_message', 'end'],
  summary: null,
}

const room = {
  detail,
  room: {
    room_revision: 'ce-room-v1', tutor_state: 'idle', avatar_id: 'brunette',
    capabilities: { history: true, text_input: true, voice_input: true, transcript_draft: true },
  },
}

const historyPage = { items: [], next_cursor: null }

function response(data: unknown, status = 200) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => data })
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

function installFetch(initialRoom = room) {
  let current = initialRoom
  const mock = vi.fn((path: string, init?: RequestInit) => {
    if (path.includes('/room')) return response(current)
    if (path.startsWith('/api/sessions?')) return response(historyPage)
    if (init?.method === 'POST' && path.endsWith('/advance')) return response(current.detail)
    if (init?.method === 'POST' && path.endsWith('/retry')) return response(current.detail)
    if (init?.method === 'POST' && path.endsWith('/end')) return response(current.detail)
    if (init?.method === 'POST' && path.endsWith('/messages')) return response(current.detail)
    return response(current)
  })
  vi.stubGlobal('fetch', mock)
  return { mock, setRoom: (value: typeof room) => { current = value } }
}

describe('CE Conversation Room', () => {
  it('顯示模組化房間、中央 brunette avatar 與文字／語音輸入', async () => {
    installFetch()
    renderPage()
    expect(await screen.findByText('情境 1 / 3')).toBeInTheDocument()
    expect(screen.getByLabelText('對話紀錄')).toBeInTheDocument()
    expect(screen.getByLabelText('Socratic tutor avatar')).toHaveAttribute('data-avatar-id', 'brunette')
    expect(screen.getByRole('textbox', { name: '文字輸入' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '開始語音輸入' })).toBeInTheDocument()
    expect(screen.queryByText(/天橋/)).not.toBeInTheDocument()
  })

  it('路口以後端 available_actions 投影下一步並保留輸入框唯讀狀態', async () => {
    const crossroad = {
      ...room,
      detail: {
        ...detail,
        session: { ...detail.session, flow_state: 'at_crossroad' },
        available_actions: ['advance', 'end'],
      },
    }
    installFetch(crossroad)
    renderPage()
    expect(await screen.findByRole('button', { name: '前往下一個情境' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '文字輸入' })).toBeDisabled()
    expect(screen.queryByText(/天橋/)).not.toBeInTheDocument()
  })

  it('進階後重新讀取 RoomView 並呈現新情境', async () => {
    const crossroad = {
      ...room,
      detail: {
        ...detail,
        session: { ...detail.session, flow_state: 'at_crossroad' },
        available_actions: ['advance', 'end'],
      },
    }
    const entered = {
      ...room,
      detail: {
        ...detail,
        session: { ...detail.session, current_stage_index: 1 },
        stage: { index: 1, key: 'footbridge', title: '天橋上的男子', opening_statement: '天橋開場白' },
        messages: [...detail.messages, { seq: 1, role: 'tutor', content: '天橋開場白' }],
      },
    }
    const state = installFetch(crossroad)
    state.mock.mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === 'POST' && path.endsWith('/advance')) {
        state.setRoom(entered)
        return response(entered.detail)
      }
      if (path.includes('/room')) return response(entered)
      if (path.startsWith('/api/sessions?')) return response(historyPage)
      return response(entered)
    })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '前往下一個情境' }))
    expect(await screen.findByText('情境 2 / 3')).toBeInTheDocument()
    expect(screen.getByText('天橋開場白')).toBeInTheDocument()
  })

  it('文字輸入沿既有 messages endpoint 送出並刷新 RoomView', async () => {
    const state = installFetch()
    state.mock.mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === 'POST' && path.endsWith('/messages')) return response(detail)
      if (path.includes('/room')) return response(room)
      if (path.startsWith('/api/sessions?')) return response(historyPage)
      return response(room)
    })
    renderPage()
    const input = await screen.findByRole('textbox', { name: '文字輸入' })
    fireEvent.change(input, { target: { value: '我的想法' } })
    fireEvent.click(screen.getByRole('button', { name: '傳送' }))
    await waitFor(() => expect(state.mock).toHaveBeenCalledWith(
      '/api/sessions/s1/messages',
      expect.objectContaining({ method: 'POST' }),
    ))
    await waitFor(() => expect(input).toHaveValue(''))
  })

  it('待回覆訊息呈現 retry action', async () => {
    const pending = {
      ...room,
      detail: {
        ...detail,
        messages: [...detail.messages, { seq: 1, role: 'student', content: '我的發言' }],
        available_actions: ['retry', 'end'],
      },
    }
    installFetch(pending)
    renderPage()
    expect(await screen.findByRole('button', { name: '重試教授回覆' })).toBeInTheDocument()
    expect(screen.getByLabelText('Socratic tutor avatar')).toHaveAttribute('data-avatar-state', 'thinking')
  })
})
