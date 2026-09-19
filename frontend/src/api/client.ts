import type { components } from './types'
import { getLearnerId } from '../identity'

export type SessionView = components['schemas']['SessionView']
export type SessionDetail = components['schemas']['SessionDetail']
export type SummaryView = components['schemas']['SummaryView']
export type Action = SessionView['available_actions'][number]

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`API ${status}`)
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
  if (!response.ok) throw new ApiError(response.status)
  return (await response.json()) as T
}

export const createSession = (ladderId: string) =>
  request<SessionView>('/sessions', {
    method: 'POST',
    body: JSON.stringify({ ladder_id: ladderId }),
  })

export const getSession = (id: string) => request<SessionDetail>(`/sessions/${id}`)

export const sendMessage = (id: string, text: string) =>
  request<SessionView>(`/sessions/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })

export const retry = (id: string) =>
  request<SessionView>(`/sessions/${id}/retry`, { method: 'POST' })

export const endSession = (id: string) =>
  request<SessionView>(`/sessions/${id}/end`, { method: 'POST' })

export const createSummary = (id: string) =>
  request<SummaryView>(`/sessions/${id}/summary`, { method: 'POST' })

export const getSummary = (id: string) => request<SummaryView>(`/sessions/${id}/summary`)
