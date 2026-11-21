import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Dialog } from '../../components/Dialog'
import { getAIConnection, getAIConnectionUsage, setAIConnectionMode, type AIConnectionView } from '../../contract/classroomClient'
import { useT } from '../../i18n/useT'
import { Button, FormError } from '../../ui'
import styles from './AIConnection.module.css'
import { AIConnectionForm, type FormState } from './AIConnectionForm'
import { COMPATIBLE, CONSOLES, FIELD_OF, KEY_PAGES, useFailureText, useServiceName } from './aiConnectionServices'
import { ModeChoice, type Mode } from './ModeChoice'
import { dollars, UsagePanel, usedShare, type Usage } from './UsagePanel'

type Editing = null | 'replace' | 'advanced'
const IDLE: FormState = { adapter: '', failure: null, busy: false }

/**
 * 老師的「AI 連線設定」（/teach/ai-settings），照 Figma「實際尺寸畫面」A01–A12、B01–B05、C01–C04。
 * 不做（需求）：「一般 AI｜語音」分頁、系統提供時的用量、A09／C05 詳情、「用量為示意數字」那行。
 */
export function AIConnectionPage() {
  const { t } = useT('teach')
  const serviceName = useServiceName()
  const failureText = useFailureText()
  const [view, setView] = useState<AIConnectionView | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [editing, setEditing] = useState<Editing>(null)
  // Clicked 「自己的金鑰」 with no key to switch back to: the form shows, still 系統提供 until applied.
  const [choosingOwn, setChoosingOwn] = useState(false)
  const [confirmSystem, setConfirmSystem] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [switchFailed, setSwitchFailed] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(IDLE)
  const [usage, setUsage] = useState<Usage | null>(null)

  const loadUsage = useCallback(() => {
    setUsage({ state: 'loading' })
    getAIConnectionUsage()
      .then(found => setUsage(found.status === 'none' ? null : { state: 'ready', usage: found }))
      .catch(() => setUsage({ state: 'ready', usage: { status: 'failed', adapter: null, used: null, limit: null, remaining: null, limit_reset: null } }))
  }, [])

  const show = useCallback((next: AIConnectionView) => {
    setView(next)
    setEditing(null)
    setChoosingOwn(false)
    setForm(IDLE)
    if (next.mode === 'own') loadUsage()
    else setUsage(null)
  }, [loadUsage])

  useEffect(() => {
    getAIConnection().then(show).catch(() => setLoadFailed(true))
  }, [show])

  if (loadFailed) return <main className={styles.page}><FormError role="alert">{t('aiSettings.loadFailed')}</FormError></main>
  if (!view) return <main className={styles.page} aria-busy="true" />

  const own = view.own
  const keptUsable = Boolean(own?.key_usable)
  const systemOff = !view.system.available
  const formShown = editing !== null || (view.mode === 'system' && (choosingOwn || (systemOff && !keptUsable)))
  const selected: Mode = view.mode === 'own' || choosingOwn || (systemOff && !own) ? 'own' : 'system'
  const ownUsage = view.mode === 'own' && usage?.state === 'ready' ? usage.usage : null
  const share = ownUsage ? usedShare(ownUsage) : null
  const service = serviceName(own?.adapter)
  const failure = formShown ? form.failure : null
  const formService = serviceName(form.adapter)

  async function switchTo(mode: Mode) {
    setConfirmSystem(false)
    setSwitching(true)
    setSwitchFailed(null)
    try {
      show(await setAIConnectionMode(mode))
    } catch (problem) {
      setSwitchFailed(failureText(problem).message)
    } finally {
      setSwitching(false)
    }
  }

  function choose(mode: Mode) {
    if (mode === 'system') {
      if (view?.mode === 'own') setConfirmSystem(true)
      else { setChoosingOwn(false); setEditing(null); setForm(IDLE) }
      return
    }
    if (view?.mode === 'system' && keptUsable) void switchTo('own')
    else setChoosingOwn(true)
  }

  // A10、A12：頁面頂端的錯誤；金鑰、模型、網址、名稱的錯誤只標在欄位上（A11）。
  const topFailure = failure && !FIELD_OF[failure.code]
    ? (failure.code === 'AI_CONNECTION_QUOTA' ? t('aiSettings.failQuota', { service: formService })
      : failure.code === 'AI_CONNECTION_UNREACHABLE' ? t('aiSettings.failUnreachable', { service: formService })
        : failure.code === 'AI_CONNECTION_TIMEOUT' ? t('aiSettings.failTimeout', { service: formService })
          : failure.message)
    : null
  const lead = failure && view.mode === 'system' ? 'aiSettings.leadNotSwitched'
    : formShown ? 'aiSettings.leadForm' : view.mode === 'own' ? 'aiSettings.leadOwn' : 'aiSettings.leadSystem'
  const remaining = ownUsage?.remaining ?? 0

  return <main className={styles.page}>
    <header className={styles.header}>
      <nav className={styles.breadcrumb} aria-label={t('aiSettings.breadcrumbLabel')}>
        <span>{t('aiSettings.breadcrumbTeacher')}</span><span aria-hidden="true">/</span><span>{t('aiSettings.breadcrumbSettings')}</span>
      </nav>
      <h1 className={styles.title}>{t('aiSettings.title')}</h1>
      <p className={styles.lead}>{t(lead)}</p>
    </header>

    <div className={styles.top}>
      {view.mode === 'system' && systemOff && own && <Alert tone="warning">{t('aiSettings.systemClosed')}</Alert>}
      {topFailure && <Alert tone="error">{topFailure}{t('aiSettings.notSaved')}</Alert>}
      {switchFailed && <Alert tone="error">{switchFailed}</Alert>}
      {own && (formShown || view.mode === 'system') && <Alert tone="done">
        {t(view.mode === 'own' ? 'aiSettings.current' : 'aiSettings.kept', { service, model: own.model, last4: own.key_last4 ?? '' })}
      </Alert>}
      <ModeChoice value={selected} systemDisabled={systemOff} busy={switching} onChoose={choose} />
    </div>

    {formShown
      ? <div className={styles.columns}>
        <AIConnectionForm
          view={view}
          advanced={editing === 'advanced'}
          onApplied={show}
          onCancel={editing !== null || choosingOwn ? () => { setEditing(null); setChoosingOwn(false); setForm(IDLE) } : undefined}
          onState={setForm}
        />
        <FormSide view={view} form={form} />
      </div>
      : view.mode === 'own' && own
        ? <div className={styles.stack}>
          {ownUsage && share !== null && remaining <= 0 && <Alert tone="error">
            {t('aiSettings.noQuota')} <TopUp adapter={own.adapter} />
          </Alert>}
          {ownUsage && share !== null && remaining > 0 && share > 0.9 && <Alert tone="warning">
            {t('aiSettings.lowQuota', { amount: dollars(remaining), percent: ((remaining / (ownUsage.limit ?? 1)) * 100).toFixed(1), service })}
          </Alert>}
          <OwnCard view={view} onReplace={() => setEditing('replace')} onAdvanced={() => setEditing('advanced')} />
          {usage && <UsagePanel usage={usage} adapter={own.adapter} onRefresh={loadUsage} />}
        </div>
        : <div className={styles.stack}>
          <SystemCard model={view.system.model} />
          <div className={styles.columns}>
            <span />
            <SideCard title={t('aiSettings.explainTitle')}><p className={styles.sideText}>{t('aiSettings.explainBody')}</p></SideCard>
          </div>
        </div>}

    {confirmSystem && <Dialog
      title={t('aiSettings.confirmSystemTitle')}
      onClose={() => setConfirmSystem(false)}
      footer={<>
        <Button variant="outline" onClick={() => setConfirmSystem(false)}>{t('aiSettings.cancel')}</Button>
        <Button variant="primary" data-autofocus onClick={() => { void switchTo('system') }}>{t('aiSettings.confirm')}</Button>
      </>}
    >
      <div className={styles.dialogBody}>
        <p className={styles.dialogStrong}>{t('aiSettings.confirmSystemStrong')}</p>
        <p>{t('aiSettings.confirmSystemBody')}</p>
      </div>
    </Dialog>}
  </main>
}

const ICONS = {
  done: <path d="M9 12.5l2 2 4-4.5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />,
  warning: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17h.01" /></>,
  error: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></>,
}

/** 頁面頂端的提示訊息（Figma 元件「提示訊息」：完成、需要注意、錯誤）。src/ui 還沒有這個元件，這頁自己用的。 */
function Alert({ tone, children }: { tone: 'done' | 'warning' | 'error'; children: ReactNode }) {
  return <div className={styles.alert} data-tone={tone} role={tone === 'error' ? 'alert' : tone === 'warning' ? 'status' : undefined}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[tone]}</svg>
    <span>{children}</span>
  </div>
}

function TopUp({ adapter, short }: { adapter: string; short?: boolean }) {
  const { t } = useT('teach')
  const serviceName = useServiceName()
  if (!CONSOLES[adapter]) return null
  return <a className={styles.link} href={CONSOLES[adapter]} target="_blank" rel="noreferrer">
    {short ? t('aiSettings.topUpShort') : t('aiSettings.topUp', { service: serviceName(adapter) })}
  </a>
}

/** A01：目前使用中的系統提供。 */
function SystemCard({ model }: { model: string | null }) {
  const { t } = useT('teach')
  return <section className={`${styles.card} ${styles.systemCard}`} aria-labelledby="ai-system-title">
    <p className={styles.inUse}>{t('aiSettings.inUse')}</p>
    <h2 id="ai-system-title" className={styles.systemTitle}>{t('aiSettings.systemCardTitle')}</h2>
    <p className={styles.systemModel}><span>{t('aiSettings.systemModel')}</span><b>{model ?? '—'}</b></p>
    <p className={styles.meta}>{t('aiSettings.systemManaged')}</p>
    {model !== null && <span className={styles.readyPill}>●  {t('aiSettings.systemReady')}</span>}
  </section>
}

/** A08：已連線的自己的金鑰。 */
function OwnCard({ view, onReplace, onAdvanced }: { view: AIConnectionView; onReplace: () => void; onAdvanced: () => void }) {
  const { t } = useT('teach')
  const serviceName = useServiceName()
  const own = view.own!
  return <section className={`${styles.card} ${styles.ownCard}`} aria-labelledby="ai-own-title">
    <div className={styles.cardHead}>
      <h2 id="ai-own-title" className={styles.cardTitle}>{t('aiSettings.ownCardTitle')}</h2>
      <Button variant="outline" className={styles.replaceButton} onClick={onReplace}>{t('aiSettings.replace')}</Button>
    </div>
    <dl className={styles.facts}>
      <div><dt>{t('aiSettings.service')}</dt><dd>{serviceName(own.adapter)}</dd></div>
      <div><dt>{t('aiSettings.model')}</dt><dd>{own.model}</dd></div>
      <div><dt>{t('aiSettings.key')}</dt><dd>{`•••• •••• ${own.key_last4 ?? ''}`}</dd><span className={styles.small}>{t('aiSettings.encrypted')}</span></div>
    </dl>
    <div className={styles.cardFoot}>
      <p className={styles.status} data-ok={own.key_usable}>{'●  '}{t(own.key_usable ? 'aiSettings.connected' : 'aiSettings.keyBroken')}</p>
      <button type="button" className={styles.textButton} onClick={onAdvanced}>{t('aiSettings.advancedOpen')}</button>
    </div>
  </section>
}

function SideCard({ title, tone, children }: { title: string; tone?: 'soft'; children: ReactNode }) {
  return <aside className={`${styles.card} ${styles.side}`} data-tone={tone}>
    <h2 className={styles.sideTitle}>{title}</h2>
    {children}
  </aside>
}

/** 表單右側的說明卡：失敗時換成對應的那張（A10 額度、A11 金鑰、A12 連不上），自訂相容服務用 B03 那兩張。 */
function FormSide({ view, form }: { view: AIConnectionView; form: FormState }) {
  const { t } = useT('teach')
  const serviceName = useServiceName()
  const service = serviceName(form.adapter)
  const fromSystem = view.mode === 'system'
  const code = form.failure?.code
  if (code === 'AI_CONNECTION_QUOTA') {
    return <SideCard title={t('aiSettings.quotaTitle')}>
      <p className={styles.sideText}>{t(fromSystem ? 'aiSettings.quotaBody' : 'aiSettings.quotaBodyOwn')}</p>
      <span className={styles.sideFoot}><TopUp adapter={form.adapter} short /></span>
    </SideCard>
  }
  if (code === 'AI_CONNECTION_KEY_INVALID') {
    return <SideCard title={t('aiSettings.keySourceTitle')}>
      <p className={styles.sideText}>{t('aiSettings.keySourceBody', { service })}</p>
      {KEY_PAGES[form.adapter] && <span className={styles.sideFoot}>
        <a className={styles.link} href={KEY_PAGES[form.adapter]} target="_blank" rel="noreferrer">{t('aiSettings.keyPage')}</a>
      </span>}
    </SideCard>
  }
  if (code === 'AI_CONNECTION_UNREACHABLE' || code === 'AI_CONNECTION_TIMEOUT') {
    return <SideCard title={t('aiSettings.offlineTitle')}>
      <p className={styles.sideText}>{t(fromSystem ? 'aiSettings.offlineBody' : 'aiSettings.offlineBodyOwn')}</p>
    </SideCard>
  }
  if (form.adapter === COMPATIBLE) {
    return <div className={styles.stack}>
      <SideCard title={t('aiSettings.compatibleTitle')}>
        <p className={styles.sideText}>{t('aiSettings.compatibleBody')}</p>
        <p className={`${styles.sideFoot} ${styles.sideStrong}`}>{t('aiSettings.noBalance')}</p>
      </SideCard>
      <SideCard title={t('aiSettings.sharedTitle')} tone="soft"><p className={styles.sideText}>{t('aiSettings.sharedBody')}</p></SideCard>
    </div>
  }
  return <SideCard title={t(view.own ? 'aiSettings.replaceTitle' : 'aiSettings.setupGuideTitle')}>
    <p className={styles.sideText}>{t(view.own ? 'aiSettings.replaceBody' : 'aiSettings.setupGuideBody')}</p>
    {view.own && <>
      <h3 className={styles.sideSubtitle}>{t('aiSettings.setupGuideTitle')}</h3>
      <p className={styles.sideText}>{t('aiSettings.setupGuideBody')}</p>
    </>}
    {form.busy
      ? <p className={`${styles.sideFoot} ${styles.testingNote}`}>{t('aiSettings.testingNote')}</p>
      : !form.adapter && <p className={`${styles.sideFoot} ${styles.sideHint}`}>{t('aiSettings.keyAfterService')}</p>}
  </SideCard>
}
