import { getLearnerId } from '../../../identity'
import type {
  ConversationRoomView,
  SessionHistoryPage,
  TranscriptDraftView,
} from '../model/types'

class RoomApiError extends Error {
  constructor(readonly status: number) {
    super(`Room API ${status}`)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Learner-Id': getLearnerId(),
      ...(init.headers as Record<string, string> | undefined),
    },
  })
  if (!response.ok) throw new RoomApiError(response.status)
  return (await response.json()) as T
}

export const getRoom = (sessionId: string) =>
  request<ConversationRoomView>(`/sessions/${sessionId}/room`)

export const listHistory = (cursor?: string) => {
  const query = new URLSearchParams({ limit: '30' })
  if (cursor) query.set('cursor', cursor)
  return request<SessionHistoryPage>(`/sessions?${query.toString()}`)
}

export const createTranscriptDraft = (
  sessionId: string,
  text: string,
  confidence?: number,
) =>
  request<TranscriptDraftView>(`/sessions/${sessionId}/transcript-drafts`, {
    method: 'POST',
    body: JSON.stringify({
      text,
      adapter: 'browser-speech',
      locale: 'zh-TW',
      confidence: confidence ?? null,
    }),
  })

export const confirmTranscriptDraft = (sessionId: string, draftId: string) =>
  request<TranscriptDraftView>(
    `/sessions/${sessionId}/transcript-drafts/${draftId}/confirm`,
    { method: 'POST' },
  )

export const discardTranscriptDraft = (sessionId: string, draftId: string) =>
  request<TranscriptDraftView>(
    `/sessions/${sessionId}/transcript-drafts/${draftId}`,
    { method: 'DELETE' },
  )
