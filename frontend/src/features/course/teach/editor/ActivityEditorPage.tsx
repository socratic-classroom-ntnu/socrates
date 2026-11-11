import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ApiError, api } from '../../../../contract/classroomClient'
import type { components } from '../../../../contract/classroomTypes'
import { useResource } from '../../../../contract/useResource'
import { useAuth } from '../../../auth/AuthContext'
import { DateTimeField } from '../../../../components/DateTimeField'
import { Dialog } from '../../../../components/Dialog'
import { errorCode, errorMessage } from '../../../../i18n/errors'
import { formatDateTime } from '../../../../i18n/format'
import { useT } from '../../../../i18n/useT'
import { Button, ButtonLink, describedBy, Field, FieldError, FieldHint, FormError, RequiredMark, StatusPill } from '../../../../ui'
import { DeleteActivityDialog } from '../DeleteActivityDialog'
import { activityDraftKey } from './draftStorage'
import {
  type ActivityForm, emptyForm, fromDraft, fromEpochSeconds, LIMITS, type Problem, problemsFrom422, toDraft,
  toEpochSeconds, validate,
} from './editorState'
import { ErrorSummary } from './ErrorSummary'
import { locate } from './problemText'
import { useActivityDraftRecovery } from './useActivityDraftRecovery'
import '../../../../styles/editor.css'

type View = components['schemas']['ActivityTeacherView']
type Course = components['schemas']['CourseTeacherView']
type Mode = 'new' | 'draft' | 'published' | 'locked' | 'readonly'
type NavState = { copiedFrom?: string; notice?: 'savedToList'; publishError?: string; publishStatus?: number } | null

function modeOf(view: View | null): Mode {
  if (!view) return 'new'
  const can = (action: string) => view.available_actions.includes(action as View['available_actions'][number])
  if (!can('update') && !can('update_details')) return 'readonly'
  if (view.locked) return 'locked'
  return view.status === 'draft' ? 'draft' : 'published'
}

const nowSeconds = () => Date.now() / 1000

/** T3／T3E／T3L: create or edit an activity; the mode comes from the route and the activity's actions. */
export function ActivityEditorPage() {
  const { t } = useT('editor')
  const { courseId, activityId } = useParams()
  const location = useLocation()
  const activity = useResource<View>(activityId ? `/activities/${activityId}` : null)
  const cid = courseId ?? activity.data?.course_id ?? null
  const course = useResource<Course>(cid ? `/courses/${cid}?role=teacher` : null)

  // 只拿這個網址自己的活動初始化表單（複製後換網址時，不能用上一個活動的內容）
  const own = activityId ? (activity.data?.id === activityId ? activity.data : null) : null
  if ((activityId && !own) || !course.data) {
    const error = activity.error ?? course.error
    if (!error) return <main className="editor-page" aria-busy="true" />
    return <main className="editor-page editor-page--message">
      <h1>{error instanceof ApiError && error.status === 404 ? t('loadFailed') : errorMessage(t, error)}</h1>
      <ButtonLink variant="outline" to="/?tab=teach">{t('crumb')}</ButtonLink>
    </main>
  }
  return <Editor
    key={activityId ?? 'new:' + courseId}
    course={course.data}
    view={own}
    reload={activity.reload}
    navState={location.state as NavState}
  />
}

function Editor({ course, view, reload, navState }: { course: Course; view: View | null; reload(): Promise<void>; navState: NavState }) {
  const { t, locale } = useT('editor')
  const { account } = useAuth()
  const navigate = useNavigate()
  const mode = modeOf(view)
  const [form, setForm] = useState<ActivityForm>(() => view ? fromDraft(view.draft) : emptyForm())
  const [dirty, setDirty] = useState(false)
  // 每次改表單加一：存檔回來時，送出後又改過的內容不算已存，草稿與未存狀態要留著
  const edits = useRef(0)
  const [baseline] = useState(form)
  // 前端 validate 找到的問題，打字時補好就拿掉；後端回的問題留到下一次送出
  const [clientProblems, setClientProblems] = useState<Problem[]>([])
  const [serverProblems, setServerProblems] = useState<Problem[]>(navState?.publishError === 'ACTIVITY_TIME_INVALID' ? [{ field: 'end', kind: 'endPast' }] : [])
  const problems = [...clientProblems, ...serverProblems.filter(p => !clientProblems.some(c => c.field === p.field))]
  const [gone, setGone] = useState(false)
  const [notice, setNotice] = useState<string | null>(navState?.notice === 'savedToList' ? t('notices.savedToList') : null)
  const [publishFailed, setPublishFailed] = useState(false)
  // 建立後發布失敗、而且不是時間問題：到了編輯頁要說明原因
  const [failure, setFailure] = useState<unknown>(navState?.publishError && navState.publishError !== 'ACTIVITY_TIME_INVALID'
    ? new ApiError(navState.publishStatus ?? 0, navState.publishError) : null)
  const [busy, setBusy] = useState(false)
  const [closed, setClosed] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [focusField, setFocusField] = useState<string | null>(null)
  const coursePath = `/teach/courses/${course.id}`

  const draftKey = mode === 'readonly' || !account ? null
    : activityDraftKey(account.id, view ? { kind: 'activity', activityId: view.id } : { kind: 'new', courseId: course.id })
  const recovery = useActivityDraftRecovery({ key: draftKey, form, setForm: restored => { edits.current += 1; setForm(restored); setDirty(true) }, dirty, baseline })

  useEffect(() => {
    if (!focusField) return
    document.getElementById(focusField)?.focus()
    setFocusField(null)
  }, [focusField])

  function change(next: ActivityForm) {
    edits.current += 1
    setForm(next)
    setDirty(true)
    // 已經顯示的錯誤，補好的就拿掉；沒顯示過的不在打字時冒出來
    if (clientProblems.length) setClientProblems(current => validate(next, nowSeconds(), { startFixed: !startEditable }).filter(p => current.some(c => c.field === p.field)))
  }

  function jump(problem: Problem) {
    setClosed(false)
    setFocusField(problem.field)
  }

  // 有錯就展開，再跳到第一個錯的欄位（頂端摘要只有一句，不再逐條列出）
  function reveal(found: Problem[]) {
    if (!found.length) return
    jump(found[0])
  }

  function check(fields?: string[]): boolean {
    const found = validate(form, nowSeconds(), { startFixed: !startEditable }).filter(p => !fields || fields.includes(p.field))
    setClientProblems(found)
    setServerProblems([])
    setFailure(null)
    setNotice(null)
    reveal(found)
    return found.length === 0
  }

  function draftBody() {
    const body = toDraft(form)
    // 已開放的活動重新發布時沿用原本的開放時間，不能送 null（否則變成「現在」）
    if (mode === 'published' && view?.status === 'open') body.starts_at = view.starts_at
    return body
  }

  async function rejected(error: unknown) {
    const code = errorCode(error)
    const fields = error instanceof ApiError && error.status === 422 ? problemsFrom422(error.detail)
      : code === 'ACTIVITY_TIME_INVALID' ? [{ field: 'end', kind: 'endPast' } as Problem] : []
    if (fields.length) {
      setServerProblems(fields)
      reveal(fields)
    } else if (error instanceof ApiError && error.status === 404) {
      setGone(true)
    } else if (code === 'ACTIVITY_LOCKED' || code === 'ACTIVITY_ACTION_UNAVAILABLE') {
      // 別人（或第一位學生）先改了狀態：重新載入，模式依新的狀態重算，表單內容保留
      await reload()
      setNotice(t('notices.stale'))
    } else {
      setFailure(error)
    }
  }

  async function run(work: () => Promise<void>) {
    setBusy(true)
    try { await work() } catch (error) { await rejected(error) } finally { setBusy(false) }
  }

  /** The server has what was sent; only clear the local draft when nothing changed since. */
  async function saved(sent: number): Promise<boolean> {
    if (edits.current !== sent) return false
    await recovery.clear()
    setDirty(false)
    return true
  }

  async function saveNew(publish: boolean) {
    if (!check()) return
    await run(async () => {
      const sent = edits.current
      const created: View = await api(`/courses/${course.id}/activities`, 'POST', draftBody())
      await saved(sent)
      if (!publish) return navigate(`/teach/activities/${created.id}/edit`, { replace: true, state: { notice: 'savedToList' } })
      try {
        await api(`/activities/${created.id}/publish`, 'POST')
        navigate(coursePath)
      } catch (error) {
        navigate(`/teach/activities/${created.id}/edit`, { replace: true, state: { publishError: errorCode(error) ?? 'UNKNOWN', publishStatus: error instanceof ApiError ? error.status : 0 } })
      }
    })
  }

  async function saveExisting(publish: boolean) {
    if (!view || !check()) return
    await run(async () => {
      const sent = edits.current
      await api(`/activities/${view.id}`, 'PUT', draftBody())
      const current = await saved(sent)
      if (!publish || !current) {
        setNotice(t('notices.saved'))
        return
      }
      try {
        await api(`/activities/${view.id}/publish`, 'POST')
        navigate(coursePath)
      } catch (error) {
        if (mode === 'published') {
          setPublishFailed(true)
          void reload()
        } else await rejected(error)
      }
    })
  }

  async function saveDetails() {
    if (!view || !check(['title', 'end'])) return
    const body: Record<string, unknown> = {}
    if (form.title.trim() !== view.draft.title) body.title = form.title.trim()
    // 表單只到分鐘：和原本的結束時間比「日期＋時刻」，不比秒數，否則沒改也會送出
    const original = view.ends_at === null ? null : fromEpochSeconds(view.ends_at)
    const end = toEpochSeconds(form.end.date, form.end.time)
    if (end !== null && (original?.date !== form.end.date || original?.time !== form.end.time)) body.ends_at = end
    // 沒有改任何東西：和成功一樣回課程頁，不送 PATCH
    if (Object.keys(body).length === 0) return navigate(coursePath)
    await run(async () => {
      const sent = edits.current
      await api(`/activities/${view.id}`, 'PATCH', body)
      if (!(await saved(sent))) return setNotice(t('notices.saved'))
      navigate(coursePath)
    })
  }

  async function copy() {
    if (!view) return
    await run(async () => {
      const created: View = await api(`/activities/${view.id}/copy`, 'POST')
      navigate(`/teach/activities/${created.id}/edit`, { state: { copiedFrom: view.draft.title } })
    })
  }

  async function cancel() {
    await recovery.flush()
    navigate(coursePath)
  }

  const fieldError = (field: string) => { const p = problems.find(x => x.field === field); return p ? locate(p, t).message : null }
  const startEditable = mode === 'new' || mode === 'draft' || (mode === 'published' && view?.status === 'scheduled')
  const readonlyAll = mode === 'readonly'

  const buttons: ReactNode = {
    new: <>
      <Button variant="quiet" className="editor-head__button" disabled={busy} onClick={() => void cancel()}>{t('actions.cancel')}</Button>
      <Button variant="outline" className="editor-head__button" disabled={busy} onClick={() => void saveNew(false)}>{t('actions.saveToList')}</Button>
      <Button variant="primary" className="editor-head__button" disabled={busy} onClick={() => void saveNew(true)}>{t('actions.create')}</Button>
    </>,
    draft: <>
      <Button variant="quiet" className="editor-head__button" disabled={busy} onClick={() => void cancel()}>{t('actions.cancel')}</Button>
      <Button variant="outline" className="editor-head__button" disabled={busy} onClick={() => void saveExisting(false)}>{t('actions.saveChanges')}</Button>
      <Button variant="primary" className="editor-head__button" disabled={busy} onClick={() => void saveExisting(true)}>{t('actions.create')}</Button>
    </>,
    published: <>
      <Button variant="quiet" className="editor-head__button" disabled={busy} onClick={() => void cancel()}>{t('actions.cancel')}</Button>
      <Button variant="primary" className="editor-head__button" disabled={busy} onClick={() => void saveExisting(true)}>{t('actions.saveChanges')}</Button>
    </>,
    locked: <>
      <Button variant="quiet" className="editor-head__button" disabled={busy} onClick={() => void cancel()}>{t('actions.cancel')}</Button>
      <Button variant="primary" className="editor-head__button" disabled={busy} onClick={() => void saveDetails()}>{t('actions.saveChanges')}</Button>
    </>,
    readonly: <ButtonLink variant="quiet" className="editor-head__button" to={coursePath}>{t('actions.back')}</ButtonLink>,
  }[mode]

  const canDelete = view?.available_actions.includes('delete')
  const banner = mode === 'locked' || mode === 'readonly'
    ? <div className="editor-banner editor-banner--locked">
        <div>
          {mode === 'locked' && <strong>{t('locked.title')}</strong>}
          <p>{mode === 'readonly' ? t('locked.readonlyBody') : view?.has_unpublished_changes ? t('locked.pendingBody') : t('locked.body')}</p>
        </div>
        <Button variant="outline" disabled={busy} onClick={() => void copy()}>{t('actions.copy')}</Button>
      </div>
    : null

  return <main className="editor-page">
    <header className="editor-head">
      <div className="editor-head__title">
        <nav className="editor-crumbs" aria-label={t('crumb')}><Link to="/?tab=teach">{t('crumb')}</Link><span aria-hidden="true">/</span><Link to={coursePath}>{course.name}</Link></nav>
        <div className="editor-head__row">
          <h1>{view ? t('titleEdit') : t('titleNew')}</h1>
          {view && <StatusPill tone={view.status}>{t(`teach:status.${view.status}`)}</StatusPill>}
        </div>
        {!readonlyAll && <span className="editor-autosave" role="status">{recovery.savedAt ? t('autosave.saved') : t('autosave.idle')}</span>}
      </div>
      <div className="editor-head__actions">
        {canDelete && <button type="button" className="editor-link editor-link--danger" disabled={busy} onClick={() => setDeleting(true)}>{t('actions.delete')}</button>}
        {buttons}
      </div>
    </header>

    {navState?.copiedFrom && <p className="editor-banner">{t('notices.copied', { title: navState.copiedFrom })}</p>}
    {notice && <p className="editor-banner editor-banner--ok" role="status">{notice}</p>}
    {publishFailed && <p className="editor-banner editor-banner--warn" role="status">{t('notices.publishFailed')}</p>}
    {!publishFailed && mode === 'published' && view?.has_unpublished_changes && <p className="editor-banner editor-banner--warn">{t('notices.pending')}</p>}
    {banner}
    {problems.length > 0 && <ErrorSummary />}
    {failure !== null && <FormError role="alert">{errorMessage(t, failure)}</FormError>}
    {gone && <FormError role="alert">{t('notices.notFound')} <Link to={coursePath}>{t('actions.toCourse')}</Link></FormError>}

    <div className="editor-columns">
      <div className="editor-main">
        <section className="editor-card" aria-labelledby="editor-basics">
          <header className="editor-card__head">
            <h2 id="editor-basics">{t('sections.basics')}</h2>
            <button type="button" className="editor-card__toggle" aria-expanded={!closed} onClick={() => setClosed(current => !current)}
              aria-label={closed ? t('sections.expand', { name: t('sections.basics') }) : t('sections.collapse', { name: t('sections.basics') })}>⌄</button>
          </header>
          {!closed && <div className="editor-card__body">
            <EditorField id="title" label={t('fields.title')} hint={t('fields.titleHint')} required error={fieldError('title')} t={t}>
              <textarea id="title" rows={4} value={form.title} maxLength={LIMITS.title} readOnly={readonlyAll}
                aria-invalid={fieldError('title') ? true : undefined} aria-describedby={describedBy(fieldError('title') && 'title-error', 'title-hint')} onChange={event => change({ ...form, title: event.target.value })} />
            </EditorField>
            <div className="editor-window">
              <fieldset className="editor-window__start">
                <legend>{t('fields.start')}</legend>
                {startEditable ? <>
                  <div role="radiogroup" aria-label={t('fields.start')} className="segmented">
                    <button type="button" role="radio" aria-checked={form.start.mode === 'now'} onClick={() => change({ ...form, start: { mode: 'now' } })}>{t('fields.startNow')}</button>
                    <button type="button" role="radio" aria-checked={form.start.mode === 'at'} onClick={() => change({ ...form, start: form.start.mode === 'at' ? form.start : { mode: 'at', date: '', time: '' } })}>{t('fields.startAt')}</button>
                  </div>
                  {form.start.mode === 'at' && <DateTimeField id="start" label={t('fields.start')} value={form.start} invalid={Boolean(fieldError('start'))}
                    describedBy={describedBy(fieldError('start') && 'start-error', !readonlyAll && 'editor-window-hint')}
                    onChange={value => change({ ...form, start: { mode: 'at', ...value } })} />}
                  {fieldError('start') && <FieldError id="start-error">{fieldError('start')}</FieldError>}
                </> : <p className="editor-window__fixed">{view?.starts_at ? t('fields.opened', { time: formatDateTime(view.starts_at, locale, 'weekdayDateTime') }) : '—'}</p>}
              </fieldset>
              <fieldset className="editor-window__end">
                <legend>{t('fields.end')}<RequiredMark /></legend>
                <DateTimeField id="end" label={t('fields.end')} value={form.end} readOnly={readonlyAll} invalid={Boolean(fieldError('end'))}
                  describedBy={describedBy(fieldError('end') && 'end-error', !readonlyAll && 'editor-window-hint')}
                  min={form.start.mode === 'at' && form.start.date && form.start.time ? form.start : undefined}
                  onChange={value => change({ ...form, end: value })} />
                {fieldError('end') && <FieldError id="end-error">{fieldError('end')}</FieldError>}
              </fieldset>
            </div>
            {!readonlyAll && <FieldHint id="editor-window-hint">{mode === 'locked' ? t('fields.lockedWindowHint') : t('fields.windowHint')}</FieldHint>}
          </div>}
        </section>
      </div>
    </div>

    {recovery.restoreOpen && <Dialog
      title={t('restore.title', { time: recovery.updatedAt ? formatDateTime(Date.parse(recovery.updatedAt) / 1000, locale, 'dateTime') : '' })}
      onClose={() => recovery.dismiss()}
      footer={<>
        <Button variant="quiet" onClick={() => void recovery.discard()}>{t('restore.discard')}</Button>
        <Button variant="primary" data-autofocus onClick={() => recovery.restore()}>{t('restore.restore')}</Button>
      </>}
    ><p className="dialog__text">{t('restore.body')}</p></Dialog>}
    {deleting && view && <DeleteActivityDialog
      title={view.draft.title}
      activityId={view.id}
      onCancel={() => setDeleting(false)}
      onDeleted={() => { void recovery.clear(); navigate(coursePath) }}
    />}
  </main>
}

type Translate = (key: string, options?: Record<string, unknown>) => string

function EditorField({ id, label, required, hint, error, children, t }: { id: string; label: string; required?: boolean; hint?: string; error?: string | null; children: ReactNode; t: Translate }) {
  return <Field id={id} label={label} required={required} requiredText={t('fields.required')} invalid={Boolean(error)}>
    {children}
    {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    {hint && <FieldHint id={`${id}-hint`}>{hint}</FieldHint>}
  </Field>
}
