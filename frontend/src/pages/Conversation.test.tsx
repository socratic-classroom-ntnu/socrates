import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Conversation from './Conversation'
import { vi } from '../testkit'

// Interaction tests use a renderer stub. GLB pixels are recorded by browser-readback.
jest.mock('../features/conversation-room/avatar/PortraitStage', () => ({
  PortraitStage: ({ state }: { state: string }) => <section data-testid="avatar-stage" data-avatar-id="ce-brunette" data-avatar-state={state} />,
}))
const detail = {
  session: { id: 's1', status: 'active', flow_state: 'active_in_stage', current_stage_index: 0, total_stages: 3, end_reason: null },
  stage: { index: 0, key: 'trolley_basic', title: '失控的電車', opening_statement: '一輛電車…' },
  messages: [{ seq: 0, role: 'tutor', content: '一輛電車…' }],
  available_actions: ['send_message', 'end'], summary: null,
}
const room = { detail, room: { room_revision: 'ce-room-v1', tutor_state: 'idle', avatar_id: 'brunette', capabilities: { history: true, text_input: true, voice_input: true, transcript_draft: true } } }
function response(data: unknown) { return Promise.resolve({ ok: true, status: 200, json: async () => data }) }
function installFetch(initial = room, afterAdvance?: typeof room) {
  let current = initial
  const mock = vi.fn((path: string, init?: RequestInit) => {
    if (path.includes('/room')) return response(current)
    if (path.startsWith('/api/sessions?')) return response({ items: [], next_cursor: null })
    if (init?.method === 'POST' && path.endsWith('/advance') && afterAdvance) current = afterAdvance
    return response(current.detail)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}
function renderPage() {
  return render(<MemoryRouter initialEntries={['/sessions/s1']}><Routes>
    <Route path="/sessions/:sessionId" element={<Conversation />} />
    <Route path="/sessions/:sessionId/summary" element={<p>總結畫面</p>} />
  </Routes></MemoryRouter>)
}
describe('CE portrait room', () => {
  it('中央人像、浮動導師對話框與文字語音輸入', async () => {
    installFetch(); renderPage()
    await screen.findByText('失控的電車')
    expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-avatar-id', 'ce-brunette')
    expect(screen.getByTestId('tutor-dialogue')).toHaveTextContent('一輛電車…')
    expect(screen.getByRole('textbox', { name: '文字輸入' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '開始語音輸入' })).toBeInTheDocument()
    expect(screen.queryByText(/天橋/)).not.toBeInTheDocument()
  })
  it('左右側欄各自伸縮，右上三槓選單可操作', async () => {
    installFetch(); renderPage(); await screen.findByText('失控的電車')
    fireEvent.click(screen.getByRole('button', { name: '展開歷史側欄' }))
    expect(document.getElementById('ce-history')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '展開對話側欄' }))
    expect(document.getElementById('ce-transcript')).toBeVisible()
    expect(document.getElementById('ce-history')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '三槓選單' }))
    expect(screen.getByRole('navigation', { name: '聊天室選單' })).toBeVisible()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.getElementById('ce-history')).not.toBeVisible()
    expect(document.getElementById('ce-transcript')).not.toBeVisible()
  })
  it('路口投影後端available_actions與已進入情境', async () => {
    installFetch({ ...room, detail: { ...detail, session: { ...detail.session, flow_state: 'at_crossroad' }, available_actions: ['advance', 'end'] } }); renderPage()
    expect(await screen.findByRole('button', { name: '前往下一個情境' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '文字輸入' })).toBeDisabled()
    expect(screen.queryByText(/天橋/)).not.toBeInTheDocument()
  })
  it('進階後讀取新RoomView', async () => {
    const crossroad = { ...room, detail: { ...detail, available_actions: ['advance', 'end'] } }
    const entered = { ...room, detail: { ...detail, session: { ...detail.session, current_stage_index: 1 }, stage: { ...detail.stage, index: 1, title: '天橋上的男子' }, messages: [...detail.messages, { seq: 1, role: 'tutor', content: '天橋開場白' }] } }
    installFetch(crossroad, entered); renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '前往下一個情境' }))
    expect(await screen.findByText('天橋上的男子')).toBeInTheDocument()
    expect(screen.getByTestId('tutor-dialogue')).toHaveTextContent('天橋開場白')
  })
  it('文字沿messages endpoint送出並刷新', async () => {
    const fetchMock = installFetch(); renderPage()
    const input = screen.getByRole('textbox', { name: '文字輸入' })
    await waitFor(() => expect(input).toBeEnabled())
    fireEvent.change(input, { target: { value: '我的想法' } })
    fireEvent.click(screen.getByRole('button', { name: '傳送' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/sessions/s1/messages', expect.objectContaining({ method: 'POST' })))
    await waitFor(() => expect(input).toHaveValue(''))
  })
  it('待回覆訊息呈現續接動作與thinking', async () => {
    installFetch({ ...room, detail: { ...detail, available_actions: ['retry', 'end'] } }); renderPage()
    expect(await screen.findByRole('button', { name: '續接導師回覆' })).toBeInTheDocument()
    expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-avatar-state', 'thinking')
  })
  it('三槓選單結束動作進入既有Summary', async () => {
    const fetchMock = installFetch(); renderPage(); await screen.findByText('失控的電車')
    fireEvent.click(screen.getByRole('button', { name: '三槓選單' }))
    fireEvent.click(screen.getByRole('button', { name: '結束並查看總結' }))
    expect(await screen.findByText('總結畫面')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/sessions/s1/end', expect.objectContaining({ method: 'POST' }))
  })
})
