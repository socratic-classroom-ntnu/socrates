import type { SessionDetail } from '../../../api/client'
export type MessageView = SessionDetail['messages'][number]
export type Action = SessionDetail['available_actions'][number]
export type TutorState = 'idle' | 'thinking' | 'speaking'
export type InputState = 'idle' | 'typing' | 'listening' | 'transcribing'
export type TutorPresenceState = 'idle' | 'listening' | 'thinking' | 'speaking'
export interface RoomCapabilities { history: boolean; text_input: boolean; voice_input: boolean; transcript_draft: boolean }
export interface ConversationRoomView {
  detail: SessionDetail
  room: { room_revision: string; tutor_state: TutorPresenceState; avatar_id: 'brunette'; capabilities: RoomCapabilities }
}
export interface SessionHistoryItem {
  id: string; status: 'active' | 'ended'; current_stage_index: number; total_stages: number;
  started_at: string; ended_at: string | null; end_reason: string | null;
  summary_preview: string | null; updated_at?: string; stage_title?: string | null;
}
export interface SessionHistoryPage { items: SessionHistoryItem[]; next_cursor: string | null }
export interface TranscriptDraftView {
  id: string; session_id: string; text: string; adapter: string; locale: string;
  confidence: number | null; status: string; created_at: string;
  confirmed_at: string | null; discarded_at: string | null
}
