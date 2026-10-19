import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { type ActivityForm, emptyForm } from './editorState'
import { type DraftKV, loadActivityDraft, memoryKV, saveActivityDraft, setDraftBackend } from './draftStorage'
import { useActivityDraftRecovery } from './useActivityDraftRecovery'

let kv: DraftKV & { data: Map<string, unknown> }
beforeEach(() => { kv = memoryKV(); setDraftBackend(kv); jest.useFakeTimers() })
afterEach(() => { jest.useRealTimers() })
afterAll(() => setDraftBackend(null))

const KEY = 'u-1:new:c-1'

function useEditor(initial: ActivityForm, dirtyAtStart = false) {
  const [form, setForm] = useState(initial)
  const [dirty, setDirty] = useState(dirtyAtStart)
  const recovery = useActivityDraftRecovery({ key: KEY, form, setForm: next => { setForm(next); setDirty(true) }, dirty })
  return { form, setForm, setDirty, recovery, type: (title: string) => { setForm(f => ({ ...f, title })); setDirty(true) } }
}

async function settle() {
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}

test('debounces writes for 300ms', async () => {
  const { result } = renderHook(() => useEditor(emptyForm()))
  await settle()
  act(() => result.current.type('第'))
  act(() => { jest.advanceTimersByTime(200) })
  act(() => result.current.type('第三'))
  act(() => { jest.advanceTimersByTime(200) })
  expect(kv.data.size).toBe(0)
  await act(async () => { jest.advanceTimersByTime(150) })
  await settle()
  expect((await loadActivityDraft(KEY))?.form.title).toBe('第三')
})

test('a clean form is never saved', async () => {
  renderHook(() => useEditor(emptyForm()))
  await act(async () => { jest.advanceTimersByTime(1000) })
  expect(kv.data.size).toBe(0)
})

test('flushes on hidden and beforeunload', async () => {
  const { result } = renderHook(() => useEditor(emptyForm()))
  await settle()
  act(() => result.current.type('切走前'))
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
  await settle()
  expect((await loadActivityDraft(KEY))?.form.title).toBe('切走前')

  act(() => result.current.type('關頁前'))
  await act(async () => { window.dispatchEvent(new Event('beforeunload')) })
  await settle()
  expect((await loadActivityDraft(KEY))?.form.title).toBe('關頁前')
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})

test('autosaves incomplete form and offers recovery', async () => {
  await saveActivityDraft(KEY, { ...emptyForm(), title: '上次寫到這裡' }, '2026-10-19T12:00:00.000Z')
  const { result } = renderHook(() => useEditor({ ...emptyForm(), title: '後端的內容' }))
  await settle()
  expect(result.current.recovery.restoreOpen).toBe(true)
  expect(result.current.recovery.updatedAt).toBe('2026-10-19T12:00:00.000Z')
})

test('restore waits for explicit choice', async () => {
  await saveActivityDraft(KEY, { ...emptyForm(), title: '上次寫到這裡' }, new Date().toISOString())
  const { result } = renderHook(() => useEditor({ ...emptyForm(), title: '後端的內容' }))
  await settle()
  await act(async () => { jest.advanceTimersByTime(1000) })
  expect(result.current.form.title).toBe('後端的內容')
  act(() => result.current.recovery.restore())
  expect(result.current.form.title).toBe('上次寫到這裡')
  expect(result.current.recovery.restoreOpen).toBe(false)
})

test('discard and successful server save clear the snapshot', async () => {
  await saveActivityDraft(KEY, { ...emptyForm(), title: '舊的' }, new Date().toISOString())
  const { result } = renderHook(() => useEditor(emptyForm()))
  await settle()
  await act(async () => { await result.current.recovery.discard() })
  expect(kv.data.size).toBe(0)
  expect(result.current.recovery.restoreOpen).toBe(false)

  act(() => result.current.type('新的'))
  await act(async () => { jest.advanceTimersByTime(300) })
  await settle()
  expect(kv.data.size).toBe(1)
  act(() => result.current.type('又改了'))
  await act(async () => { await result.current.recovery.clear() })
  await act(async () => { jest.advanceTimersByTime(1000) })
  expect(kv.data.size).toBe(0)
})

test('a snapshot equal to the blank form is cleared silently, ignoring ids', async () => {
  await saveActivityDraft(KEY, emptyForm(), new Date().toISOString())
  const { result } = renderHook(() => {
    const [form, setForm] = useState(emptyForm())
    return useActivityDraftRecovery({ key: KEY, form, setForm, dirty: false, baseline: form, ignoreIds: true })
  })
  await settle()
  expect(result.current.restoreOpen).toBe(false)
  expect(kv.data.size).toBe(0)
})

test('dismiss closes the question but keeps the snapshot', async () => {
  await saveActivityDraft(KEY, { ...emptyForm(), title: '上次寫到這裡' }, new Date().toISOString())
  const { result } = renderHook(() => useEditor(emptyForm()))
  await settle()
  act(() => result.current.recovery.dismiss())
  expect(result.current.recovery.restoreOpen).toBe(false)
  expect((await loadActivityDraft(KEY))?.form.title).toBe('上次寫到這裡')
})
