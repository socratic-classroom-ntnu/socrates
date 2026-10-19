import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActivityForm } from './editorState'
import { type ActivityDraftSnapshot, clearActivityDraft, loadActivityDraft, purgeExpiredActivityDrafts, saveActivityDraft } from './draftStorage'

type Options = {
  key: string | null
  form: ActivityForm
  setForm(form: ActivityForm): void
  dirty: boolean
  /** What the page loaded; a snapshot equal to it is cleared without asking. */
  baseline?: ActivityForm
  /** Compare without ids: a blank form gets fresh ids every time it is created. */
  ignoreIds?: boolean
}

function comparable(form: ActivityForm, ignoreIds: boolean): string {
  if (!ignoreIds) return JSON.stringify(form)
  return JSON.stringify({ ...form, questions: form.questions.map(q => ({ title: q.title, scenario: q.scenario, follow_up_direction: q.follow_up_direction, options: q.options.map(o => o.text) })) })
}

const DEBOUNCE_MS = 300

/**
 * Keeps an unfinished form on this device: saves 300ms after the last change, flushes when the
 * page hides, unloads or the editor unmounts, and on load offers what it found without overwriting the server copy.
 */
export function useActivityDraftRecovery({ key, form, setForm, dirty, baseline, ignoreIds = false }: Options) {
  const [found, setFound] = useState<ActivityDraftSnapshot | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef({ key, form, dirty, choosing: false })
  const compareWith = useRef<string | null>(null)
  compareWith.current = baseline ? comparable(baseline, ignoreIds) : null
  latest.current = { key, form, dirty, choosing: found !== null }

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  const flush = useCallback(async () => {
    const pending = timer.current !== null
    cancel()
    const { key: k, form: f, dirty: d, choosing } = latest.current
    if (!pending || !k || !d || choosing) return
    const at = new Date().toISOString()
    await saveActivityDraft(k, f, at)
    setSavedAt(at)
  }, [])

  // 載入時看看有沒有上次沒寫完的內容
  useEffect(() => {
    setFound(null)
    if (!key) return
    let live = true
    void purgeExpiredActivityDrafts(new Date()).then(() => loadActivityDraft(key)).then(async snapshot => {
      if (!live) return
      // 和剛載入的內容一樣：沒什麼好恢復的，靜靜清掉
      if (snapshot && compareWith.current !== null && comparable(snapshot.form, ignoreIds) === compareWith.current) {
        await clearActivityDraft(key)
        return
      }
      setFound(snapshot)
    })
    return () => { live = false }
  }, [key])

  useEffect(() => {
    if (!key || !dirty || found) return
    cancel()
    timer.current = setTimeout(() => { void flush() }, DEBOUNCE_MS)
  }, [form, key, dirty, found, flush])

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') void flush() }
    const onUnload = () => { void flush() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('beforeunload', onUnload)
      // 站內導航（麵包屑、側欄、上一頁）不會觸發上面兩個事件：離開編輯器時把還在等的內容寫掉
      void flush()
    }
  }, [flush])

  return {
    restoreOpen: found !== null,
    updatedAt: found?.updatedAt ?? null,
    savedAt,
    restore() {
      if (!found) return
      setForm(found.form)
      setFound(null)
    },
    /** Close the question but keep the snapshot; it is offered again next time. */
    dismiss() {
      setFound(null)
    },
    async discard() {
      setFound(null)
      if (key) await clearActivityDraft(key)
    },
    /** After the server has the content (save, publish, delete). */
    async clear() {
      cancel()
      setSavedAt(null)
      if (key) await clearActivityDraft(key)
    },
    flush,
  }
}
