import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Dialog } from '../../components/Dialog'
import {
  applyAIConnection, listAIConnectionModels, testAIConnection,
  type AIConnectionInput, type AIConnectionModelsInput, type AIConnectionView,
} from '../../contract/classroomClient'
import { useT } from '../../i18n/useT'
import { Button, describedBy, Field, FieldError, FieldHint, PasswordInput, Select } from '../../ui'
import styles from './AIConnection.module.css'
import { ADAPTERS, COMPATIBLE, FIELD_OF, KEY_PAGES, useFailureText, useServiceName, type FieldName } from './aiConnectionServices'
import { ConnectionModelPicker, type ModelList } from './ConnectionModelPicker'

type Form = { adapter: string; model: string; apiKey: string; baseUrl: string; name: string }
type Result = { state: 'idle' } | { state: 'testing' } | { state: 'ok' } | { state: 'failed'; code: string; message: string }

/** Password managers' own "leave this field alone" marks: the key is not a login password. */
const NOT_A_LOGIN = { 'data-1p-ignore': true, 'data-lpignore': 'true', 'data-bwignore': true } as const
/** Typing a key waits this long before the list is asked for again. */
const LIST_DELAY_MS = 500

/** A blank key or name stays out of the request: the backend keeps the saved key / the service's name. */
function bodyOf(form: Form): AIConnectionInput {
  const body: AIConnectionInput = { adapter: form.adapter, model: form.model.trim() }
  if (form.apiKey.trim()) body.api_key = form.apiKey.trim()
  if (form.adapter === COMPATIBLE) body.base_url = form.baseUrl.trim()
  if (form.name.trim()) body.name = form.name.trim()
  return body
}

function sourceOf(form: Form): AIConnectionModelsInput {
  const body = bodyOf(form)
  return { adapter: body.adapter, ...(body.api_key ? { api_key: body.api_key } : {}), ...(body.base_url !== undefined ? { base_url: body.base_url } : {}) }
}

/**
 * 設定表單（A02–A07、A10–A12、B01–B04）：選服務 → 貼金鑰 → 選模型（不預選）。
 * 「測試」只測；「套用」由後端先測、成功才存，失敗時原本的連線不變。取代正在用的自己的金鑰前
 * 先確認：只改連線名稱用 B02，其他用 B01；第一次設定或從系統提供換過來不確認。
 */
export function AIConnectionForm({ view, advanced, onApplied, onCancel, onFailure }: {
  view: AIConnectionView
  /** Opened from 「進階設定 ›」: the current service and model filled in, the advanced fields open. */
  advanced: boolean
  onApplied: (view: AIConnectionView) => void
  onCancel?: () => void
  /** The code of the latest test or apply failure (null when cleared), for the page's banner and side card. */
  onFailure: (code: string | null, message: string) => void
}) {
  const { t } = useT('teach')
  const serviceName = useServiceName()
  const failureText = useFailureText()
  const own = view.own
  const [form, setForm] = useState<Form>(() => advanced && own
    ? { adapter: own.adapter, model: own.model, apiKey: '', baseUrl: own.base_url ?? '', name: own.name }
    : { adapter: '', model: '', apiKey: '', baseUrl: '', name: '' })
  const [showAdvanced, setShowAdvanced] = useState(advanced)
  const [result, setResult] = useState<Result>({ state: 'idle' })
  const [applying, setApplying] = useState(false)
  const [confirm, setConfirm] = useState<'replace' | 'advanced' | null>(null)
  // Bumped by every edit and every new test: a reply that is not for the latest one is dropped.
  const latest = useRef(0)
  const [list, setList] = useState<ModelList>({ state: 'idle' })
  const listRequest = useRef(0)
  const service = serviceName(form.adapter)
  // A blank key keeps the saved one only for the same service at the same address.
  const keepsKey = Boolean(own?.key_usable && form.adapter && form.adapter === own.adapter
    && (form.adapter !== COMPATIBLE || form.baseUrl.trim().replace(/\/+$/, '') === (own.base_url ?? '')))
  const hasSource = Boolean(form.adapter) && (form.adapter !== COMPATIBLE || Boolean(form.baseUrl.trim()))
  const canList = hasSource && Boolean(form.apiKey.trim() || keepsKey)
  const ready = canList && Boolean(form.model.trim())
  const source = JSON.stringify(sourceOf(form))

  useEffect(() => {
    const mine = ++listRequest.current
    if (!canList) { setList({ state: 'idle' }); return }
    setList({ state: 'loading' })
    const timer = setTimeout(() => {
      listAIConnectionModels(JSON.parse(source) as AIConnectionModelsInput)
        .then(found => { if (mine === listRequest.current) setList({ state: 'ready', models: found.models }) })
        .catch((failure: unknown) => {
          if (mine === listRequest.current) setList({ state: 'failed', message: failureText(failure).message })
        })
    }, form.apiKey.trim() ? LIST_DELAY_MS : 0)
    return () => clearTimeout(timer)
    // Reload only when where the list comes from changes.
  }, [source, canList])

  function edit(name: keyof Form, value: string) {
    latest.current += 1
    setForm(current => ({
      ...current,
      [name]: value,
      // Another service: no model carried over (不預選), the URL field only for a compatible one.
      ...(name === 'adapter' && value !== current.adapter ? { model: '', baseUrl: value === COMPATIBLE ? current.baseUrl : '' } : {}),
    }))
    if (name === 'adapter' && value === COMPATIBLE) setShowAdvanced(true)
    if (result.state !== 'idle') { setResult({ state: 'idle' }); onFailure(null, '') }
  }

  function failed(failure: unknown) {
    const { code, message } = failureText(failure)
    setResult({ state: 'failed', code, message })
    onFailure(code, message)
  }

  async function runTest() {
    const mine = ++latest.current
    setResult({ state: 'testing' })
    onFailure(null, '')
    try {
      await testAIConnection(bodyOf(form))
      if (mine === latest.current) setResult({ state: 'ok' })
    } catch (failure) {
      if (mine === latest.current) failed(failure)
    }
  }

  async function apply() {
    setConfirm(null)
    setApplying(true)
    onFailure(null, '')
    try {
      onApplied(await applyAIConnection(bodyOf(form)))
    } catch (failure) {
      latest.current += 1
      failed(failure)
    } finally {
      setApplying(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready || applying) return
    // Only when it replaces the teacher's own key in use (第一次設定、從系統提供換過來不確認).
    if (view.mode === 'own' && own) {
      const onlyName = form.adapter === own.adapter && !form.apiKey.trim() && form.model.trim() === own.model
        && (form.adapter !== COMPATIBLE || form.baseUrl.trim().replace(/\/+$/, '') === (own.base_url ?? ''))
        && Boolean(form.name.trim()) && form.name.trim() !== own.name
      setConfirm(onlyName ? 'advanced' : 'replace')
      return
    }
    void apply()
  }

  const failure = result.state === 'failed' ? result : null
  const fieldWithError = failure ? FIELD_OF[failure.code] : undefined
  const errorOn = (name: FieldName) => (fieldWithError === name ? failure?.message ?? '' : null)
  const control = (name: FieldName, hint?: string | false) => ({
    'aria-invalid': errorOn(name) ? true : undefined,
    'aria-describedby': describedBy(errorOn(name) && `ai-${name}-error`, hint && `ai-${name}-hint`),
  })
  const keyHint = keepsKey && fieldWithError !== 'apiKey' ? t('aiSettings.keepKeyHint', { last4: own?.key_last4 ?? '' }) : null
  const title = t(own ? 'aiSettings.formTitle' : 'aiSettings.setupTitle')

  return <>
    <form aria-label={title} autoComplete="off" className={`${styles.card} ${styles.panel}`} onSubmit={submit}>
      <h2 className={styles.cardTitle}>{title}</h2>
      <div className={styles.fieldRow}>
        <Field id="ai-adapter" label={t('aiSettings.service')} invalid={Boolean(errorOn('adapter'))}>
          <Select
            id="ai-adapter"
            value={form.adapter}
            listLabel={t('aiSettings.service')}
            placeholder={t('aiSettings.pickService')}
            options={ADAPTERS.map(adapter => ({ value: adapter, label: serviceName(adapter) }))}
            invalid={Boolean(errorOn('adapter'))}
            describedBy={describedBy(errorOn('adapter') && 'ai-adapter-error', KEY_PAGES[form.adapter] && 'ai-adapter-hint')}
            onChange={adapter => edit('adapter', adapter)}
          />
          {errorOn('adapter') && <FieldError id="ai-adapter-error">{errorOn('adapter')}</FieldError>}
          {KEY_PAGES[form.adapter] && <FieldHint id="ai-adapter-hint">
            <a className={styles.link} href={KEY_PAGES[form.adapter]} target="_blank" rel="noreferrer">{t('aiSettings.getKey', { service })}</a>
          </FieldHint>}
        </Field>
        <Field id="ai-model" label={t('aiSettings.model')} invalid={Boolean(errorOn('model'))}>
          <ConnectionModelPicker
            id="ai-model"
            value={form.model}
            list={list}
            service={form.adapter ? service : ''}
            disabled={!canList}
            invalid={Boolean(errorOn('model'))}
            describedBy={describedBy(errorOn('model') && 'ai-model-error', hasSource && !canList && 'ai-model-hint')}
            onChange={modelId => edit('model', modelId)}
          />
          {errorOn('model') && <FieldError id="ai-model-error">{errorOn('model')}</FieldError>}
          {hasSource && !canList && <FieldHint id="ai-model-hint">{t('aiSettings.needKeyForModels')}</FieldHint>}
        </Field>
      </div>
      <Field id="ai-apiKey" label={t('aiSettings.pasteKey')} invalid={Boolean(errorOn('apiKey'))}>
        <div className={styles.keyRow}>
          <PasswordInput
            id="ai-apiKey"
            value={form.apiKey}
            placeholder={form.adapter ? undefined : t('aiSettings.keyPlaceholder')}
            disabled={!form.adapter}
            autoComplete="new-password"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            {...NOT_A_LOGIN}
            onChange={event => edit('apiKey', event.target.value)}
            {...control('apiKey', keyHint)}
          />
          <Button variant="outline" disabled={!ready || result.state === 'testing' || applying} onClick={() => { void runTest() }}>
            {t(result.state === 'testing' ? 'aiSettings.testing' : 'aiSettings.test')}
          </Button>
        </div>
        {errorOn('apiKey') && <FieldError id="ai-apiKey-error">{errorOn('apiKey')}</FieldError>}
        {keyHint && <FieldHint id="ai-apiKey-hint">{keyHint}</FieldHint>}
        {result.state === 'ok' && <p className={styles.success} role="status">{t('aiSettings.tested')}</p>}
      </Field>
      {!ready && <p className={styles.meta}>{t('aiSettings.formHint')}</p>}
      {showAdvanced && <div className={styles.fieldRow}>
        <Field id="ai-name" label={t('aiSettings.name')} invalid={Boolean(errorOn('name'))}>
          <input id="ai-name" className={styles.input} value={form.name} placeholder={service || undefined} maxLength={100} onChange={event => edit('name', event.target.value)} {...control('name', !errorOn('name') && 'x')} />
          {errorOn('name') ? <FieldError id="ai-name-error">{errorOn('name')}</FieldError> : <FieldHint id="ai-name-hint">{t('aiSettings.nameHint')}</FieldHint>}
        </Field>
        {form.adapter === COMPATIBLE && <Field id="ai-baseUrl" label={t('aiSettings.baseUrl')} invalid={Boolean(errorOn('baseUrl'))}>
          <input id="ai-baseUrl" className={styles.input} value={form.baseUrl} placeholder="https://" spellCheck={false} onChange={event => edit('baseUrl', event.target.value)} {...control('baseUrl')} />
          {errorOn('baseUrl') && <FieldError id="ai-baseUrl-error">{errorOn('baseUrl')}</FieldError>}
        </Field>}
      </div>}
      <div className={styles.actions}>
        <button type="button" className={styles.textButton} aria-expanded={showAdvanced} onClick={() => setShowAdvanced(open => !open)}>{t('aiSettings.advanced')}</button>
        <span className={styles.spacer} />
        {onCancel && <Button variant="outline" onClick={onCancel}>{t('aiSettings.cancel')}</Button>}
        <Button type="submit" variant="primary" disabled={!ready || applying || result.state === 'testing'}>{t(applying ? 'aiSettings.applying' : 'aiSettings.apply')}</Button>
      </div>
    </form>
    {confirm && <Dialog
      title={t(confirm === 'advanced' ? 'aiSettings.confirmAdvancedTitle' : 'aiSettings.confirmReplaceTitle')}
      onClose={() => setConfirm(null)}
      footer={<>
        <Button variant="outline" onClick={() => setConfirm(null)}>{t('aiSettings.cancel')}</Button>
        <Button variant="primary" data-autofocus onClick={() => { void apply() }}>{t('aiSettings.confirm')}</Button>
      </>}
    >
      <p>{t(confirm === 'advanced' ? 'aiSettings.confirmAdvancedBody' : 'aiSettings.confirmReplaceBody')}</p>
    </Dialog>}
  </>
}
