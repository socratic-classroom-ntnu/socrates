import { emptyForm } from './editorState'
import {
  activityDraftKey, clearActivityDraft, type DraftKV, loadActivityDraft, memoryKV, purgeExpiredActivityDrafts,
  saveActivityDraft, setDraftBackend,
} from './draftStorage'

let kv: DraftKV & { data: Map<string, unknown> }
beforeEach(() => { kv = memoryKV(); setDraftBackend(kv) })
afterAll(() => setDraftBackend(null))

const day = 86400_000

test('round trips by account and target key', async () => {
  const mine = activityDraftKey('u-1', { kind: 'new', courseId: 'c-1' })
  const theirs = activityDraftKey('u-2', { kind: 'new', courseId: 'c-1' })
  const existing = activityDraftKey('u-1', { kind: 'activity', activityId: 'a-1' })
  expect(new Set([mine, theirs, existing]).size).toBe(3)
  const form = { ...emptyForm(), title: '寫到一半' }
  const at = new Date().toISOString()
  await saveActivityDraft(mine, form, at)
  expect(await loadActivityDraft(mine)).toEqual({ version: 1, form, updatedAt: at })
  expect(await loadActivityDraft(theirs)).toBeNull()
  await clearActivityDraft(mine)
  expect(await loadActivityDraft(mine)).toBeNull()
})

test('expired and invalid snapshots are removed', async () => {
  const old = activityDraftKey('u-1', { kind: 'new', courseId: 'c-1' })
  const broken = activityDraftKey('u-1', { kind: 'new', courseId: 'c-2' })
  const future = activityDraftKey('u-1', { kind: 'new', courseId: 'c-3' })
  await saveActivityDraft(old, emptyForm(), new Date(Date.now() - 8 * day).toISOString())
  kv.data.set(broken, { version: 1, form: { title: 3 }, updatedAt: new Date().toISOString() })
  kv.data.set(future, { version: 2, form: emptyForm(), updatedAt: new Date().toISOString() })
  expect(await loadActivityDraft(old)).toBeNull()
  expect(await loadActivityDraft(broken)).toBeNull()
  expect(await loadActivityDraft(future)).toBeNull()
  expect(kv.data.size).toBe(0)
})

test('purge removes only expired snapshots', async () => {
  const fresh = activityDraftKey('u-1', { kind: 'new', courseId: 'c-1' })
  const stale = activityDraftKey('u-1', { kind: 'new', courseId: 'c-2' })
  await saveActivityDraft(fresh, emptyForm(), new Date(Date.now() - 6 * day).toISOString())
  await saveActivityDraft(stale, emptyForm(), new Date(Date.now() - 8 * day).toISOString())
  await purgeExpiredActivityDrafts(new Date())
  expect([...kv.data.keys()]).toEqual([fresh])
})

test('storage failure does not reject the editor flow', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
  const fail = () => Promise.reject(new Error('blocked'))
  setDraftBackend({ get: fail, put: fail, delete: fail, keys: fail })
  const key = activityDraftKey('u-1', { kind: 'new', courseId: 'c-1' })
  await expect(saveActivityDraft(key, emptyForm(), new Date().toISOString())).resolves.toBeUndefined()
  await expect(loadActivityDraft(key)).resolves.toBeNull()
  await expect(clearActivityDraft(key)).resolves.toBeUndefined()
  await expect(purgeExpiredActivityDrafts(new Date())).resolves.toBeUndefined()
  expect(warn).toHaveBeenCalled()
})
