import type { components } from './generated'
export type Room = components['schemas']['RoomView']
export type Account = components['schemas']['AccountView']
export type ScriptDoc = components['schemas']['ScriptDocument']
export type Question = components['schemas']['Question']
export type CommandKind = components['schemas']['Command']['kind']
let csrf = ''
export function setCSRF(value: string) { csrf = value }
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch('/api/v2' + path, { method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const data = await res.json()
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `API ${res.status}`)
  return data as T
}
export function command(room: string, kind: CommandKind, data: Record<string, unknown> = {}, actionId = crypto.randomUUID()) {
  return api(`/classrooms/${room}/commands`, 'POST', {kind, data, action_id: actionId})
}
export async function importYAML(text: string): Promise<{ id: string }> {
  const r = await fetch('/api/v2/scripts/import', { method: 'POST', credentials:'same-origin',
    headers: {'Content-Type':'application/yaml','X-CSRF-Token':csrf}, body:text })
  const x = await r.json(); if(!r.ok) throw new Error(JSON.stringify(x.detail)); return x
}
export async function exportYAML(id: string): Promise<string> {
  const r=await fetch(`/api/v2/scripts/${id}/yaml`,{credentials:'same-origin'})
  if(!r.ok) throw new Error(`YAML ${r.status}`); return r.text()
}
