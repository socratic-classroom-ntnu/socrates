import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, getSystemAI, listSystemAIModels, saveSystemAI, testSystemAI, type SystemAIInput, type SystemAIModelsInput, type SystemAIView } from '../../contract/classroomClient'
import { useT } from '../../i18n/useT'
import { Button, describedBy, Field, FieldError, FieldHint, FormError, Select } from '../../ui'
import styles from './Admin.module.css'
import { adminTime } from './adminTime'
import { ModelPicker, type ModelList } from './ModelPicker'

type OnError = (failure: unknown) => void
type FieldName = 'adapter' | 'model' | 'apiKey' | 'baseUrl'

const COMPATIBLE = 'openai-compatible'
/** 服務名稱是產品名，不翻譯（後台 spec P32）；只有「自訂相容服務」照頁面語言。 */
const PRODUCTS: Record<string, string> = {
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
}
const ADAPTERS = [...Object.keys(PRODUCTS), COMPATIBLE]

function useServiceName() {
  const { t } = useT('admin')
  return (adapter: string | null) => (adapter === COMPATIBLE ? t('systemAI.compatible') : PRODUCTS[adapter ?? ''] ?? adapter ?? '')
}

/** 哪個錯誤標在哪一欄（後台 spec P33、〈介面〉欄位錯誤）；其餘放按鈕上方。 */
const FIELD_OF: Record<string, FieldName> = {
  SYSTEM_AI_ADAPTER_INVALID: 'adapter',
  SYSTEM_AI_MODEL_REQUIRED: 'model',
  SYSTEM_AI_MODEL_INVALID: 'model',
  SYSTEM_AI_MODEL_NOT_FOUND: 'model',
  SYSTEM_AI_KEY_REQUIRED: 'apiKey',
  SYSTEM_AI_KEY_MALFORMED: 'apiKey',
  SYSTEM_AI_KEY_INVALID: 'apiKey',
  SYSTEM_AI_QUOTA: 'apiKey',
  SYSTEM_AI_BASE_URL_REQUIRED: 'baseUrl',
  SYSTEM_AI_BASE_URL_INVALID: 'baseUrl',
  SYSTEM_AI_BASE_URL_NOT_ALLOWED: 'baseUrl',
}
const KNOWN = new Set([...Object.keys(FIELD_OF), 'SYSTEM_AI_TIMEOUT', 'SYSTEM_AI_UNREACHABLE', 'SYSTEM_AI_CHANGED'])

type Form = { adapter: string; model: string; apiKey: string; baseUrl: string }
type Result = { state: 'idle' } | { state: 'testing' } | { state: 'ok'; model: string } | { state: 'failed'; code: string }

function formOf(view: SystemAIView | null): Form {
  return { adapter: view?.adapter ?? 'openrouter', model: view?.model ?? '', apiKey: '', baseUrl: view?.base_url ?? '' }
}

/** A blank key stays out of the request: the backend keeps the saved one (spec P32). */
function bodyOf(form: Form): SystemAIInput {
  const body: SystemAIInput = { adapter: form.adapter, model: form.model.trim() }
  if (form.apiKey.trim()) body.api_key = form.apiKey.trim()
  if (form.adapter === COMPATIBLE) body.base_url = form.baseUrl.trim()
  return body
}

/** Where to list models from: the same key rule as a test (spec P40). */
function sourceOf(form: Form): SystemAIModelsInput {
  const body = bodyOf(form)
  return { adapter: body.adapter, ...(body.api_key ? { api_key: body.api_key } : {}), ...(body.base_url !== undefined ? { base_url: body.base_url } : {}) }
}

/** Password managers' own "leave this field alone" marks (1Password, LastPass, Bitwarden). */
const NOT_A_LOGIN = { 'data-1p-ignore': true, 'data-lpignore': 'true', 'data-bwignore': true } as const

/**
 * The API key is not a login password. A real password field makes the browser treat the whole
 * form as a sign-in form and fill the saved account into it (Fizzy 11/19), so where the browser
 * can mask plain text the field is a masked text field; elsewhere a password field that asks
 * not to be filled with a saved password.
 */
function keyFieldType() {
  const canMask = typeof window !== 'undefined' && window.CSS?.supports?.('-webkit-text-security', 'disc')
  return canMask
    ? { type: 'text', autoComplete: 'off', 'data-masked': 'true' } as const
    : { type: 'password', autoComplete: 'new-password' } as const
}

/** Typing a key waits this long before the list is asked for again. */
const LIST_DELAY_MS = 500

function codeOf(failure: unknown): string {
  const code = failure instanceof ApiError && typeof failure.detail === 'string' ? failure.detail : ''
  return KNOWN.has(code) ? code : 'generic'
}

/** 後台「系統 AI」分頁（Figma AD9、AD9b、AD9c、AD9d；後台 spec P31–P34）。 */
export function SystemAITab({ onError }: { onError: OnError }) {
  const { t } = useT('admin')
  const [view, setView] = useState<SystemAIView | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    void getSystemAI().then(setView).catch((failure: unknown) => { setLoadFailed(true); onError(failure) })
  }, [onError])

  if (loadFailed) return <FormError role="alert">{t('systemAI.loadFailed')}</FormError>
  if (!view) return null
  if (!view.configured || editing) {
    return <ConnectionForm
      key={editing ? 'edit' : 'setup'}
      view={view}
      onCancel={view.configured ? () => setEditing(false) : undefined}
      onSaved={next => { setView(next); setEditing(false) }}
      onError={onError}
    />
  }
  return <Saved view={view} onReplace={() => setEditing(true)} />
}

function Saved({ view, onReplace }: { view: SystemAIView; onReplace: () => void }) {
  const { t, locale } = useT('admin')
  const serviceName = useServiceName()
  const time = view.updated_at === null ? '' : adminTime(locale, view.updated_at)
  const by = view.updated_by
  return <>
    <section className={`${styles.card} ${styles.panel}`} aria-labelledby="system-ai-title">
      <div className={styles.panelHead}>
        <div>
          <h2 id="system-ai-title" className={styles.panelTitle}>{t('systemAI.title')}</h2>
          <p className={styles.panelLead}>{t('systemAI.lead')}</p>
        </div>
        <Button variant="outline" onClick={onReplace}>{t('systemAI.replace')}</Button>
      </div>
      <dl className={styles.facts}>
        <div><dt>{t('systemAI.service')}</dt><dd className={styles.factStrong}>{serviceName(view.adapter)}</dd></div>
        <div><dt>{t('systemAI.model')}</dt><dd className={styles.mono}>{view.model}</dd></div>
        <div><dt>{t('systemAI.key')}</dt><dd className={styles.mono}>{`•••• •••• ${view.key_last4 ?? ''}`}</dd></div>
      </dl>
      {by && <p className={styles.meta}>{by.kind === 'admin' ? t('systemAI.updatedBy', { name: by.name, time }) : t('systemAI.imported', { time })}</p>}
    </section>
    <section className={styles.card} aria-labelledby="system-ai-uses">
      <h2 id="system-ai-uses" className={styles.listTitle}>{t('systemAI.uses')}</h2>
      <ul className={styles.list}>
        <li className={styles.useRow}>
          <span className={styles.useText}><b>{t('systemAI.usePractice')}</b><span className={styles.description}>{t('systemAI.usePracticeNote')}</span></span>
          <span className={styles.state} data-on="true">{t('systemAI.inUse')}</span>
        </li>
        <li className={styles.useRow}>
          <span className={styles.useText}>
            <b>{t('systemAI.useCourses')}</b>
            <span className={styles.description}>{t('systemAI.useCoursesBefore')}<Link to="/admin" className={styles.inlineLink}>{t('tabs.toggles')}</Link>{t('systemAI.useCoursesAfter')}</span>
          </span>
          <span className={styles.state} data-on={view.fallback_enabled}>{t(view.fallback_enabled ? 'systemAI.inUse' : 'systemAI.notInUse')}</span>
        </li>
      </ul>
    </section>
    <p className={styles.hint}>{t('systemAI.billing')}</p>
  </>
}

function ConnectionForm({ view, onCancel, onSaved, onError }: {
  view: SystemAIView; onCancel?: () => void; onSaved: (view: SystemAIView) => void; onError: OnError
}) {
  const { t } = useT('admin')
  const [form, setForm] = useState<Form>(() => formOf(view))
  const [result, setResult] = useState<Result>({ state: 'idle' })
  const [saving, setSaving] = useState(false)
  // Bumped by every edit and every new test: a reply that is not for the latest one is dropped.
  const latest = useRef(0)
  const setup = !view.configured
  const serviceName = useServiceName()
  const service = serviceName(form.adapter)
  const [list, setList] = useState<ModelList>({ state: 'idle' })
  const [listCode, setListCode] = useState<string | null>(null)
  const listRequest = useRef(0)
  // A blank key keeps the saved one only for the same service at the same address (Fizzy 11/19).
  const keepsKey = !setup && form.adapter === view.adapter && (form.adapter !== COMPATIBLE || form.baseUrl.trim() === (view.base_url ?? ''))
  const canList = Boolean(form.apiKey.trim() || keepsKey) && (form.adapter !== COMPATIBLE || Boolean(form.baseUrl.trim()))
  const source = JSON.stringify(sourceOf(form))

  useEffect(() => {
    const mine = ++listRequest.current
    setListCode(null)
    if (!canList) { setList({ state: 'idle' }); return }
    setList({ state: 'loading' })
    const timer = setTimeout(() => {
      listSystemAIModels(JSON.parse(source) as SystemAIModelsInput)
        .then(found => { if (mine === listRequest.current) setList({ state: 'ready', models: found.models }) })
        .catch((failure: unknown) => {
          if (mine !== listRequest.current) return
          const code = codeOf(failure)
          setListCode(code)
          setList({ state: 'failed', message: t(`systemAI.errors.${code}`, { service: serviceName(form.adapter) }) })
          onError(failure)
        })
    }, form.apiKey.trim() ? LIST_DELAY_MS : 0)
    return () => clearTimeout(timer)
    // Reload only when where the list comes from changes; the rest is read at that moment.
  }, [source, canList])

  function edit(name: keyof Form, value: string) {
    latest.current += 1
    setForm(current => ({ ...current, [name]: value }))
    setResult({ state: 'idle' })
  }

  async function runTest() {
    const mine = ++latest.current
    const body = bodyOf(form)
    setResult({ state: 'testing' })
    try {
      await testSystemAI(body)
      if (mine === latest.current) setResult({ state: 'ok', model: body.model })
    } catch (failure) {
      if (mine === latest.current) setResult({ state: 'failed', code: codeOf(failure) })
      onError(failure)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (result.state !== 'ok' || saving) return
    setSaving(true)
    try {
      onSaved(await saveSystemAI(bodyOf(form)))
    } catch (failure) {
      latest.current += 1
      setResult({ state: 'failed', code: codeOf(failure) })
      onError(failure)
    } finally {
      setSaving(false)
    }
  }

  // A test's own failure wins; otherwise a failed model list points at its field (spec P40).
  const failedCode = result.state === 'failed' ? result.code : listCode && FIELD_OF[listCode] ? listCode : null
  const fieldWithError = failedCode ? FIELD_OF[failedCode] : undefined
  const message = failedCode ? t(`systemAI.errors.${failedCode}`, { service }) : ''
  const errorOn = (name: FieldName) => (fieldWithError === name ? message : null)
  const control = (name: FieldName, hint?: string) => ({
    'aria-invalid': errorOn(name) ? true : undefined,
    'aria-describedby': describedBy(errorOn(name) && `system-ai-${name}-error`, hint && `system-ai-${name}-hint`),
  })
  // AD9c: while the key field shows an error, the error takes the hint's place.
  const keyHint = keepsKey && fieldWithError !== 'apiKey' ? t('systemAI.keyHint', { last4: view.key_last4 ?? '' }) : undefined
  const title = t(setup ? 'systemAI.setupTitle' : 'systemAI.editTitle')

  return <>
    {setup && <p className={styles.warning} role="note">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4" /><path d="M12 17h.01" /></svg>
      {t('systemAI.notSetUp')}
    </p>}
    <form aria-label={title} autoComplete="off" className={`${styles.card} ${styles.panel}`} onSubmit={event => { void submit(event) }}>
      <div>
        <h2 className={styles.panelTitle}>{title}</h2>
        <p className={styles.panelLead}>{t(setup ? 'systemAI.setupLead' : 'systemAI.editLead')}</p>
      </div>
      <div className={styles.fieldGrid}>
        <Field id="system-ai-adapter" label={t('systemAI.service')} invalid={Boolean(errorOn('adapter'))}>
          <Select
            id="system-ai-adapter"
            value={form.adapter}
            listLabel={t('systemAI.service')}
            options={ADAPTERS.map(adapter => ({ value: adapter, label: serviceName(adapter) }))}
            invalid={Boolean(errorOn('adapter'))}
            describedBy={describedBy(errorOn('adapter') && 'system-ai-adapter-error')}
            onChange={adapter => edit('adapter', adapter)}
          />
          {errorOn('adapter') && <FieldError id="system-ai-adapter-error">{message}</FieldError>}
        </Field>
        <Field id="system-ai-model" label={t('systemAI.model')} invalid={Boolean(errorOn('model'))}>
          <ModelPicker
            id="system-ai-model"
            value={form.model}
            list={list}
            service={service}
            disabled={!canList}
            invalid={Boolean(errorOn('model'))}
            describedBy={describedBy(errorOn('model') && 'system-ai-model-error', !canList && 'system-ai-model-hint')}
            onChange={modelId => edit('model', modelId)}
          />
          {errorOn('model') && <FieldError id="system-ai-model-error">{message}</FieldError>}
          {!canList && <FieldHint id="system-ai-model-hint">{t('systemAI.needKeyForModels')}</FieldHint>}
        </Field>
      </div>
      {form.adapter === COMPATIBLE && <Field id="system-ai-baseUrl" label={t('systemAI.baseUrl')} invalid={Boolean(errorOn('baseUrl'))}>
        <input id="system-ai-baseUrl" className={styles.input} value={form.baseUrl} placeholder="https://" autoComplete="off" spellCheck={false} onChange={event => edit('baseUrl', event.target.value)} {...control('baseUrl')} />
        {errorOn('baseUrl') && <FieldError id="system-ai-baseUrl-error">{message}</FieldError>}
      </Field>}
      <Field id="system-ai-apiKey" label={t('systemAI.key')} invalid={Boolean(errorOn('apiKey'))}>
        <input
          id="system-ai-apiKey"
          {...keyFieldType()}
          className={styles.input}
          value={form.apiKey}
          placeholder={setup ? t('systemAI.keyPlaceholder') : undefined}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          {...NOT_A_LOGIN}
          onChange={event => edit('apiKey', event.target.value)}
          {...control('apiKey', keyHint)}
        />
        {errorOn('apiKey') && <FieldError id="system-ai-apiKey-error">{message}</FieldError>}
        {keyHint && <FieldHint id="system-ai-apiKey-hint">{keyHint}</FieldHint>}
      </Field>
      {result.state === 'ok' && <p className={styles.success} role="status">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
        {t('systemAI.tested', { model: result.model })}
      </p>}
      {failedCode && !fieldWithError && <FormError role="alert">{message}</FormError>}
      {!failedCode && listCode && !FIELD_OF[listCode] && <FormError role="alert">{t(`systemAI.errors.${listCode}`, { service })}</FormError>}
      <div className={styles.formActions}>
        <Button variant="outline" disabled={result.state === 'testing'} onClick={() => { void runTest() }}>{t(result.state === 'testing' ? 'systemAI.testing' : 'systemAI.test')}</Button>
        <span className={styles.spacer} />
        {onCancel && <Button variant="outline" onClick={onCancel}>{t('systemAI.cancel')}</Button>}
        <Button type="submit" variant="primary" disabled={result.state !== 'ok' || saving}>{t('systemAI.save')}</Button>
      </div>
    </form>
    <p className={styles.hint}>{t(setup ? 'systemAI.setupFooter' : 'systemAI.editFooter')}</p>
  </>
}
