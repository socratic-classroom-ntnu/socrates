import { openDB } from 'idb'
import type { ActivityForm } from './editorState'

// 編輯器的本機未完成暫存：只在這台裝置、這個帳號，7 天後過期。和後端的「草稿」是兩回事。
export type ActivityDraftSnapshot = { version: 1; form: ActivityForm; updatedAt: string }
export type DraftTarget = { kind: 'new'; courseId: string } | { kind: 'activity'; activityId: string }

/** The few operations the store needs; IndexedDB in the browser, a Map in tests. */
export interface DraftKV {
  get(key: string): Promise<unknown>
  put(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  keys(): Promise<string[]>
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000
const DB_NAME = 'socrates-activity-drafts'
const STORE = 'drafts'

function idbKV(): DraftKV {
  const db = () => openDB(DB_NAME, 1, { upgrade(database) { database.createObjectStore(STORE) } })
  return {
    get: async key => (await db()).get(STORE, key),
    put: async (key, value) => { await (await db()).put(STORE, value, key) },
    delete: async key => { await (await db()).delete(STORE, key) },
    keys: async () => (await (await db()).getAllKeys(STORE)).map(String),
  }
}

export function memoryKV(): DraftKV & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>()
  return {
    data,
    get: async key => data.get(key),
    put: async (key, value) => { data.set(key, value) },
    delete: async key => { data.delete(key) },
    keys: async () => [...data.keys()],
  }
}

let backend: DraftKV | null = null
/** Test seam; `null` goes back to IndexedDB. */
export function setDraftBackend(kv: DraftKV | null): void { backend = kv }
const store = () => (backend ??= idbKV())

export function activityDraftKey(accountId: string, target: DraftTarget): string {
  return target.kind === 'new' ? `${accountId}:new:${target.courseId}` : `${accountId}:activity:${target.activityId}`
}

const isString = (value: unknown): value is string => typeof value === 'string'

function isForm(value: unknown): value is ActivityForm {
  const f = value as ActivityForm
  return !!f && isString(f.title) && isString(f.topic_direction) && isString(f.analysis_focus)
    && !!f.start && (f.start.mode === 'now' || (f.start.mode === 'at' && isString(f.start.date) && isString(f.start.time)))
    && !!f.end && isString(f.end.date) && isString(f.end.time)
    && Array.isArray(f.questions) && f.questions.every(q => q && isString(q.id) && isString(q.title) && isString(q.scenario)
      && isString(q.follow_up_direction) && Array.isArray(q.options) && q.options.every(o => o && isString(o.id) && isString(o.text)))
}

function expired(updatedAt: string, now: number): boolean {
  const at = Date.parse(updatedAt)
  return Number.isNaN(at) || now - at > TTL_MS
}

function warn(error: unknown) {
  console.warn('activity draft storage unavailable', error)
}

export async function loadActivityDraft(key: string): Promise<ActivityDraftSnapshot | null> {
  try {
    const raw = (await store().get(key)) as ActivityDraftSnapshot | undefined
    if (raw === undefined) return null
    if (raw?.version !== 1 || !isString(raw.updatedAt) || expired(raw.updatedAt, Date.now()) || !isForm(raw.form)) {
      await store().delete(key)
      return null
    }
    return raw
  } catch (error) {
    warn(error)
    return null
  }
}

export async function saveActivityDraft(key: string, form: ActivityForm, updatedAt: string): Promise<void> {
  try {
    await store().put(key, { version: 1, form, updatedAt } satisfies ActivityDraftSnapshot)
  } catch (error) {
    warn(error)
  }
}

export async function clearActivityDraft(key: string): Promise<void> {
  try {
    await store().delete(key)
  } catch (error) {
    warn(error)
  }
}

export async function purgeExpiredActivityDrafts(now: Date): Promise<void> {
  try {
    for (const key of await store().keys()) {
      const raw = (await store().get(key)) as Partial<ActivityDraftSnapshot> | undefined
      if (!raw || !isString(raw.updatedAt) || expired(raw.updatedAt, now.getTime())) await store().delete(key)
    }
  } catch (error) {
    warn(error)
  }
}
