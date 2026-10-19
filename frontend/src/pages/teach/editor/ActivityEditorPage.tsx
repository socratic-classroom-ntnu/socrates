import { type ReactNode, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ApiError, api } from '../../../api/classroomClient'
import type { components } from '../../../api/classroomTypes'
import { useResource } from '../../../api/useResource'
import { useAuth } from '../../../app/AuthContext'
import { DateTimeField } from '../../../components/DateTimeField'
import { Dialog } from '../../../components/Dialog'
import { errorCode, errorMessage } from '../../../i18n/errors'
import { formatDateTime } from '../../../i18n/format'
import { useT } from '../../../i18n/useT'
import { ComingSoonPage } from '../../ComingSoonPage'
import { DeleteActivityDialog } from '../DeleteActivityDialog'
import { activityDraftKey } from './draftStorage'
import {
  type ActivityForm, emptyForm, fromDraft, fromEpochSeconds, LIMITS, type Problem, problemCountByQuestion, problemsFrom422, toDraft,
  toEpochSeconds, validate,
} from './editorState'
import { ErrorSummary } from './ErrorSummary'
import { locate } from './problemText'
import { QuestionForm } from './QuestionForm'
import { QuestionOrderPanel } from './QuestionOrderPanel'
import { useActivityDraftRecovery } from './useActivityDraftRecovery'
import '../../../styles/editor.css'

type View = components['schemas']['ActivityTeacherView']
type Course = components['schemas']['CourseTeacherView']
type Mode = 'new' | 'draft' | 'published' | 'locked' | 'readonly'
type NavState = { copiedFrom?: string; notice?: 'savedToList'; publishError?: string; publishStatus?: number } | null
type Panel = 'order' | 'ai' | 'import'

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
      <Link className="button button--outline" to="/?tab=teach">{t('crumb')}</Link>
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
  const contentLocked = mode === 'locked' || mode === 'readonly'
  const [form, setForm] = useState<ActivityForm>(() => view ? fromDraft(view.draft) : emptyForm())
  const [dirty, setDirty] = useState(false)
  const [selected, setSelected] = useState(form.questions[0]?.id ?? '')
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
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const [panel, setPanel] = useState<Panel>('order')
  const [deleting, setDeleting] = useState(false)
  const [focusField, setFocusField] = useState<string | null>(null)
  const coursePath = `/teach/courses/${course.id}`

  const draftKey = mode === 'readonly' || !account ? null
    : activityDraftKey(account.id, view ? { kind: 'activity', activityId: view.id } : { kind: 'new', courseId: course.id })
  const recovery = useActivityDraftRecovery({ key: draftKey, form, setForm: restored => { setForm(restored); setDirty(true) }, dirty, baseline, ignoreIds: !view })

  useEffect(() => {
    if (!focusField) return
    document.getElementById(focusField)?.focus()
    setFocusField(null)
  }, [focusField])

  function change(next: ActivityForm, select?: string) {
    setForm(next)
    setDirty(true)
    if (select) setSelected(select)
    else if (!next.questions.some(q => q.id === selected)) setSelected(next.questions[0]?.id ?? '')
    // 已經顯示的錯誤，補好的就拿掉；沒顯示過的不在打字時冒出來
    if (clientProblems.length) setClientProblems(current => validate(next, nowSeconds(), { startFixed: !startEditable }).filter(p => current.some(c => c.field === p.field)))
  }

  function jump(problem: Problem) {
    const place = locate(problem, form, t)
    const section = place.section === 'question' ? 'question:' + place.questionId : place.section
    setClosed(current => ({ ...current, [section]: false }))
    if (place.questionId) setSelected(place.questionId)
    setFocusField(problem.field === 'end' || problem.field === 'start' ? problem.field : problem.field)
  }

  // 有錯的區塊展開，捲回頂部讓錯誤摘要看得到
  function reveal(found: Problem[]) {
    if (!found.length) return
    setClosed(current => {
      const open = { ...current }
      for (const p of found) {
        const place = locate(p, form, t)
        open[place.section === 'question' ? 'question:' + place.questionId : place.section] = false
      }
      return open
    })
    window.scrollTo?.({ top: 0 })
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
    const fields = error instanceof ApiError && error.status === 422 ? problemsFrom422(error.detail, form)
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

  async function saveNew(publish: boolean) {
    if (!check()) return
    await run(async () => {
      const created: View = await api(`/courses/${course.id}/activities`, 'POST', draftBody())
      await recovery.clear()
      setDirty(false)
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
      await api(`/activities/${view.id}`, 'PUT', draftBody())
      await recovery.clear()
      setDirty(false)
      if (!publish) {
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
      await api(`/activities/${view.id}`, 'PATCH', body)
      await recovery.clear()
      setDirty(false)
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

  const counts = problemCountByQuestion(problems)
  const index = Math.max(0, form.questions.findIndex(q => q.id === selected))
  const question = form.questions[index]
  const fieldError = (field: string) => { const p = problems.find(x => x.field === field); return p ? locate(p, form, t).message : null }
  const toggle = (key: string) => setClosed(current => ({ ...current, [key]: !current[key] }))
  const startEditable = mode === 'new' || mode === 'draft' || (mode === 'published' && view?.status === 'scheduled')
  const readonlyAll = mode === 'readonly'

  const buttons: ReactNode = {
    new: <>
      <button type="button" className="button button--quiet" disabled={busy} onClick={() => void cancel()}>{t('actions.cancel')}</button>
      <button type="button" className="button button--outline" disabled={busy} onClick={() => void saveNew(false)}>{t('actions.saveToList')}</button>
      <button type="button" className="button button--primary" disabled={busy} onClick={() => void saveNew(true)}>{t('actions.create')}</button>
    </>,
    draft: <>
      <button type="button" className="button button--quiet" disabled={busy} onClick={() => void cancel()}>{t('actions.cancel')}</button>
      <button type="button" className="button button--outline" disabled={busy} onClick={() => void saveExisting(false)}>{t('actions.saveChanges')}</button>
      <button type="button" className="button button--primary" disabled={busy} onClick={() => void saveExisting(true)}>{t('actions.create')}</button>
    </>,
    published: <>
      <button type="button" className="button button--quiet" disabled={busy} onClick={() => void cancel()}>{t('actions.cancel')}</button>
      <button type="button" className="button button--primary" disabled={busy} onClick={() => void saveExisting(true)}>{t('actions.saveChanges')}</button>
    </>,
    locked: <>
      <button type="button" className="button button--quiet" disabled={busy} onClick={() => void cancel()}>{t('actions.cancel')}</button>
      <button type="button" className="button button--primary" disabled={busy} onClick={() => void saveDetails()}>{t('actions.saveChanges')}</button>
    </>,
    readonly: <Link className="button button--quiet" to={coursePath}>{t('actions.back')}</Link>,
  }[mode]

  const canDelete = view?.available_actions.includes('delete')
  const sectionHead = (key: string, title: ReactNode, extra?: ReactNode) => <header className="editor-card__head">
    {title}
    {extra}
    <button type="button" className="editor-card__toggle" aria-expanded={!closed[key]} onClick={() => toggle(key)}
      aria-label={closed[key] ? t('sections.expand', { name: key === 'basics' ? t('sections.basics') : t('sections.direction') }) : t('sections.collapse', { name: key === 'basics' ? t('sections.basics') : t('sections.direction') })}>⌄</button>
  </header>

  const banner = mode === 'locked' || mode === 'readonly'
    ? <div className="editor-banner editor-banner--locked">
        <div>
          {mode === 'locked' && <strong>{t('locked.title')}</strong>}
          <p>{mode === 'readonly' ? t('locked.readonlyBody') : view?.has_unpublished_changes ? t('locked.pendingBody') : t('locked.body')}</p>
        </div>
        <button type="button" className="button button--outline" disabled={busy} onClick={() => void copy()}>{t('actions.copy')}</button>
      </div>
    : null

  return <main className="editor-page">
    <header className="editor-head">
      <div className="editor-head__title">
        <nav className="editor-crumbs" aria-label={t('crumb')}><Link to="/?tab=teach">{t('crumb')}</Link><span aria-hidden="true">/</span><Link to={coursePath}>{course.name}</Link></nav>
        <div className="editor-head__row">
          <h1>{view ? t('titleEdit') : t('titleNew')}</h1>
          {view && <span className={`status-pill status-pill--${view.status}`}>{t(`teach:status.${view.status}`)}</span>}
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
    {problems.length > 0 && <ErrorSummary problems={problems} form={form} onJump={jump} />}
    {failure !== null && <p className="form-error" role="alert">{errorMessage(t, failure)}</p>}
    {gone && <p className="form-error" role="alert">{t('notices.notFound')} <Link to={coursePath}>{t('actions.toCourse')}</Link></p>}

    <div className="editor-columns">
      <div className="editor-main">
        <section className="editor-card" aria-labelledby="editor-basics">
          {sectionHead('basics', <h2 id="editor-basics">{t('sections.basics')}</h2>)}
          {!closed.basics && <div className="editor-card__body">
            <Field id="title" label={t('fields.title')} required error={fieldError('title')} t={t}>
              <input id="title" value={form.title} maxLength={LIMITS.title} readOnly={readonlyAll}
                aria-invalid={fieldError('title') ? true : undefined} onChange={event => change({ ...form, title: event.target.value })} />
            </Field>
            <div className="editor-window">
              <fieldset className="editor-window__start">
                <legend>{t('fields.start')}</legend>
                {startEditable ? <>
                  <div role="radiogroup" aria-label={t('fields.start')} className="segmented">
                    <button type="button" role="radio" aria-checked={form.start.mode === 'now'} onClick={() => change({ ...form, start: { mode: 'now' } })}>{t('fields.startNow')}</button>
                    <button type="button" role="radio" aria-checked={form.start.mode === 'at'} onClick={() => change({ ...form, start: form.start.mode === 'at' ? form.start : { mode: 'at', date: '', time: '' } })}>{t('fields.startAt')}</button>
                  </div>
                  {form.start.mode === 'at' && <DateTimeField id="start" label={t('fields.start')} value={form.start} invalid={Boolean(fieldError('start'))}
                    onChange={value => change({ ...form, start: { mode: 'at', ...value } })} />}
                  {fieldError('start') && <p className="form-field__error">{fieldError('start')}</p>}
                </> : <p className="editor-window__fixed">{view?.starts_at ? t('fields.opened', { time: formatDateTime(view.starts_at, locale, 'weekdayDateTime') }) : '—'}</p>}
              </fieldset>
              <fieldset className={'editor-window__end' + (fieldError('end') ? ' form-field--error' : '')}>
                <legend>{t('fields.end')}<span className="form-field__star" aria-hidden="true"> *</span></legend>
                <DateTimeField id="end" label={t('fields.end')} value={form.end} readOnly={readonlyAll} invalid={Boolean(fieldError('end'))}
                  min={form.start.mode === 'at' && form.start.date && form.start.time ? form.start : undefined}
                  onChange={value => change({ ...form, end: value })} />
                {fieldError('end') && <p className="form-field__error">{fieldError('end')}</p>}
              </fieldset>
            </div>
            {!readonlyAll && <p className="form-field__hint">{contentLocked ? t('fields.lockedWindowHint') : t('fields.windowHint')}</p>}
          </div>}
        </section>

        <section className="editor-card" aria-labelledby="editor-direction">
          {sectionHead('direction', <div className="editor-card__titled">
            <span className="editor-card__person" aria-hidden="true">◯</span>
            <div><h2 id="editor-direction">{t('sections.direction')}</h2><p>{t('sections.directionHint')}</p></div>
          </div>, contentLocked ? <span className="locked-badge">{t('locked.badge')}</span> : null)}
          {!closed.direction && <div className="editor-card__body">
            <Field id="topic_direction" label={t('fields.topic')} required error={fieldError('topic_direction')} t={t}>
              <textarea id="topic_direction" rows={3} value={form.topic_direction} maxLength={LIMITS.topic} readOnly={contentLocked}
                aria-invalid={fieldError('topic_direction') ? true : undefined} onChange={event => change({ ...form, topic_direction: event.target.value })} />
            </Field>
            <Field id="analysis_focus" label={t('fields.analysis')} hint={t('fields.analysisHint')} t={t}>
              <textarea id="analysis_focus" rows={3} value={form.analysis_focus} maxLength={LIMITS.analysis} readOnly={contentLocked}
                onChange={event => change({ ...form, analysis_focus: event.target.value })} />
            </Field>
          </div>}
        </section>

        {question && <QuestionForm
          key={question.id}
          form={form}
          question={question}
          index={index}
          locked={contentLocked}
          problems={problems}
          onChange={change}
          collapsed={Boolean(closed['question:' + question.id])}
          onToggle={() => toggle('question:' + question.id)}
        />}
      </div>

      <aside className="editor-side">
        <div role="tablist" aria-label={t('panel.tabsLabel')} className="editor-tabs">
          {(['order', 'ai', 'import'] as Panel[]).map(key => <button key={key} type="button" role="tab" aria-selected={panel === key}
            disabled={key !== 'order' && contentLocked} onClick={() => setPanel(key)}>{t(`panel.${key}`)}</button>)}
        </div>
        <div className="editor-side__body">
          {panel === 'order' && <QuestionOrderPanel form={form} selected={selected} counts={counts} locked={contentLocked} onSelect={setSelected} onChange={change} />}
          {panel === 'ai' && <ComingSoonPage variant="panel" body={t('panel.aiSoon')} backTo={null} />}
          {panel === 'import' && <ComingSoonPage variant="panel" body={t('panel.importSoon')} backTo={null} />}
        </div>
      </aside>
    </div>

    {recovery.restoreOpen && <Dialog
      title={t('restore.title', { time: recovery.updatedAt ? formatDateTime(Date.parse(recovery.updatedAt) / 1000, locale, 'dateTime') : '' })}
      onClose={() => recovery.dismiss()}
      footer={<>
        <button type="button" className="button button--quiet" onClick={() => void recovery.discard()}>{t('restore.discard')}</button>
        <button type="button" className="button button--primary" data-autofocus onClick={() => recovery.restore()}>{t('restore.restore')}</button>
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

function Field({ id, label, required, hint, error, children, t }: { id: string; label: string; required?: boolean; hint?: string; error?: string | null; children: ReactNode; t: Translate }) {
  return <div className={'form-field' + (error ? ' form-field--error' : '')}>
    <label htmlFor={id}>{label}{required && <><span className="form-field__star" aria-hidden="true"> *</span><span className="sr-only">{t('fields.required')}</span></>}</label>
    {children}
    {error && <p className="form-field__error">{error}</p>}
    {hint && <p className="form-field__hint">{hint}</p>}
  </div>
}
