import type { ConversationRoomView, SessionHistoryPage } from '../model/types'

export const demoRoom = {
  detail: {
    session: {
      id: '00000000-0000-4000-8000-000000000001',
      status: 'active',
      flow_state: 'active_in_stage',
      current_stage_index: 0,
      total_stages: 3,
      end_reason: null,
    },
    stage: {
      index: 0,
      key: 'trolley-driver',
      title: '電車難題',
      opening_statement: '你會把電車轉向岔道嗎？',
    },
    messages: [
      { seq: 0, role: 'tutor', content: '先說說你的直覺。你會怎麼選？' },
      { seq: 1, role: 'student', content: '我會先保護最重要的人。' },
      { seq: 2, role: 'tutor', content: '這個選擇背後最重要的原則是什麼？' },
    ],
    available_actions: ['send_message', 'end'],
    summary: null,
  },
  room: {
    room_revision: 'ce-room-v1',
    tutor_state: 'idle',
    avatar_id: 'brunette',
    capabilities: {
      history: true,
      text_input: true,
      voice_input: true,
      transcript_draft: true,
    },
  },
} as unknown as ConversationRoomView

export const demoHistory = {
  items: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      status: 'active',
      current_stage_index: 0,
      total_stages: 3,
      started_at: '2026-09-21T12:00:00Z',
      ended_at: null,
      end_reason: null,
      summary_preview: '保護最重要的人',
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      status: 'ended',
      current_stage_index: 2,
      total_stages: 3,
      started_at: '2026-09-20T12:00:00Z',
      ended_at: '2026-09-20T12:30:00Z',
      end_reason: 'completed',
      summary_preview: '數量、關係與責任的拉扯',
    },
  ],
  next_cursor: null,
} as unknown as SessionHistoryPage
