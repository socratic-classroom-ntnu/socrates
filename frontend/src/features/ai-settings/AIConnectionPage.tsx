import { useCallback, useEffect, useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { getAIConnection, getAIConnectionUsage, setAIConnectionMode, type AIConnectionView } from '../../contract/classroomClient'
import { useT } from '../../i18n/useT'
import { Button, FormError } from '../../ui'
import styles from './AIConnection.module.css'
import { AIConnectionForm } from './AIConnectionForm'
import { CONSOLES, FIELD_OF, useFailureText, useServiceName } from './aiConnectionServices'
import { ModeChoice, type Mode } from './ModeChoice'
import { UsagePanel, usedShare, type Usage } from './UsagePanel'

type Editing = null | 'replace' | 'advanced'

/**
 * 老師的「AI 連線設定」（/teach/ai-settings，Figma A01–A12、B01–B05、C01–C04）。
 * 系統提供＝停用自己的連線、金鑰保留；自己的金鑰＝一組連線，全部 AI 共用一個模型。
 */
export function AIConnectionPage() {
  const { t } = useT('teach')
  const serviceName = useServiceName()
  const [view, setView] = useState<AIConnectionView | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [editing, setEditing] = useState<Editing>(null)
  // Clicked 「自己的金鑰」 with no key to switch back to: the form shows, still 系統提供 until applied.
  const [choosingOwn, setChoosingOwn] = useState(false)
  const [confirmSystem, setConfirmSystem] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [switchFailed, setSwitchFailed] = useState<string | null>(null)
  const failureText = useFailureText()
  const [failure, setFailure] = useState<{ code: string; message: string } | null>(null)
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
    setFailure(null)
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

  async function switchTo(mode: Mode) {
    setConfirmSystem(false)
    setSwitching(true)
    setSwitchFailed(null)
    try {
      show(await setAIConnectionMode(mode))
    } catch (failure) {
      setSwitchFailed(failureText(failure).message)
    } finally {
      setSwitching(false)
    }
  }

  function choose(mode: Mode) {
    if (mode === 'system') {
      if (view?.mode === 'own') setConfirmSystem(true)
      else { setChoosingOwn(false); setEditing(null); setFailure(null) }
      return
    }
    if (view?.mode === 'system' && keptUsable) void switchTo('own')
    else setChoosingOwn(true)
  }

  const topFailure = failure && !FIELD_OF[failure.code] ? failure : null
  const lead = formShown ? 'aiSettings.leadForm' : view.mode === 'own' ? 'aiSettings.leadOwn' : 'aiSettings.leadSystem'

  return <main className={styles.page}>
    <nav className={styles.breadcrumb} aria-label={t('aiSettings.breadcrumbLabel')}>
      <span>{t('aiSettings.breadcrumbTeacher')}</span><span aria-hidden="true">/</span><span>{t('aiSettings.breadcrumbSettings')}</span>
    </nav>
    <h1 className={styles.title}>{t('aiSettings.title')}</h1>
    <p className={styles.lead}>{t(lead)}</p>

    {view.mode === 'system' && systemOff && own && <Alert tone="warning" title={t('aiSettings.attention')}>{t('aiSettings.systemClosed')}</Alert>}
    {topFailure && <Alert tone="error" title={t('aiSettings.error')}>
      {topFailure.message} {view.mode === 'system' ? t('aiSettings.stillSystem') : ''}
    </Alert>}
    {switchFailed && <Alert tone="error" title={t('aiSettings.error')}>{switchFailed}</Alert>}
    {ownUsage && share !== null && (ownUsage.remaining ?? 0) <= 0 && <Alert tone="error" title={t('aiSettings.error')}>
      {t('aiSettings.noQuota')} <TopUp adapter={own?.adapter ?? ''} />
    </Alert>}
    {ownUsage && share !== null && (ownUsage.remaining ?? 0) > 0 && share > 0.9 && <Alert tone="warning" title={t('aiSettings.attention')}>
      {t('aiSettings.lowQuota', { service })} <TopUp adapter={own?.adapter ?? ''} />
    </Alert>}
    {own && (formShown || view.mode === 'system') && <p className={styles.keptLine}>
      {t(view.mode === 'own' ? 'aiSettings.current' : 'aiSettings.kept', { service, model: own.model, last4: own.key_last4 ?? '' })}
    </p>}

    <ModeChoice value={selected} systemDisabled={systemOff} busy={switching} onChoose={choose} />

    <div className={formShown || view.mode === 'system' ? styles.columns : styles.single}>
      <div className={styles.stack}>
        {formShown
          ? <AIConnectionForm
            view={view}
            advanced={editing === 'advanced'}
            onApplied={show}
            onCancel={editing !== null || choosingOwn ? () => { setEditing(null); setChoosingOwn(false); setFailure(null) } : undefined}
            onFailure={(code, message) => setFailure(code === null ? null : { code, message })}
          />
          : view.mode === 'own' && own
            ? <>
              <OwnCard view={view} onReplace={() => setEditing('replace')} onAdvanced={() => setEditing('advanced')} />
              {usage && <UsagePanel usage={usage} adapter={own.adapter} onRefresh={loadUsage} />}
            </>
            : <SystemCard model={view.system.model} />}
      </div>
      {(formShown || view.mode === 'system') && <SideCard code={formShown ? failure?.code ?? null : null} replacing={Boolean(own) && formShown} adapter={own?.adapter ?? ''} />}
    </div>

    {confirmSystem && <Dialog
      title={t('aiSettings.confirmSystemTitle')}
      onClose={() => setConfirmSystem(false)}
      footer={<>
        <Button variant="outline" onClick={() => setConfirmSystem(false)}>{t('aiSettings.cancel')}</Button>
        <Button variant="primary" data-autofocus onClick={() => { void switchTo('system') }}>{t('aiSettings.confirm')}</Button>
      </>}
    >
      <p><b>{t('aiSettings.confirmSystemStrong')}</b></p>
      <p>{t('aiSettings.confirmSystemBody')}</p>
    </Dialog>}
  </main>
}

/** 頁面頂端的提示訊息（需要注意、錯誤）：src/ui 還沒有這個元件，這頁自己用的。 */
function Alert({ tone, title, children }: { tone: 'warning' | 'error'; title: string; children: React.ReactNode }) {
  return <div className={styles.alert} data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
    <b>{title}</b><span>{children}</span>
  </div>
}

function TopUp({ adapter }: { adapter: string }) {
  const { t } = useT('teach')
  const serviceName = useServiceName()
  if (!CONSOLES[adapter]) return null
  return <a className={styles.link} href={CONSOLES[adapter]} target="_blank" rel="noreferrer">{t('aiSettings.topUp', { service: serviceName(adapter) })}</a>
}

function SystemCard({ model }: { model: string | null }) {
  const { t } = useT('teach')
  return <section className={`${styles.card} ${styles.panel}`} aria-labelledby="ai-system-title">
    <h2 id="ai-system-title" className={styles.cardTitle}>{t('aiSettings.systemCardTitle')}</h2>
    <dl className={styles.facts}><div><dt>{t('aiSettings.systemModel')}</dt><dd>{model ?? '—'}</dd></div></dl>
    <p className={styles.status} data-ok={model !== null}>{model !== null ? t('aiSettings.systemReady') : t('aiSettings.systemOff')}</p>
  </section>
}

function OwnCard({ view, onReplace, onAdvanced }: { view: AIConnectionView; onReplace: () => void; onAdvanced: () => void }) {
  const { t } = useT('teach')
  const serviceName = useServiceName()
  const own = view.own!
  return <section className={`${styles.card} ${styles.panel}`} aria-labelledby="ai-own-title">
    <div className={styles.cardHead}>
      <h2 id="ai-own-title" className={styles.cardTitle}>{t('aiSettings.ownCardTitle')}</h2>
      <Button variant="outline" onClick={onReplace}>{t('aiSettings.replace')}</Button>
    </div>
    <dl className={styles.facts}>
      <div><dt>{t('aiSettings.service')}</dt><dd>{serviceName(own.adapter)}</dd></div>
      <div><dt>{t('aiSettings.model')}</dt><dd>{own.model}</dd></div>
      <div><dt>{t('aiSettings.key')}</dt><dd className={styles.mono}>{`•••• •••• ${own.key_last4 ?? ''}`}</dd><span className={styles.meta}>{t('aiSettings.encrypted')}</span></div>
    </dl>
    <div className={styles.cardFoot}>
      <p className={styles.status} data-ok={own.key_usable}>{t(own.key_usable ? 'aiSettings.connected' : 'aiSettings.keyBroken')}</p>
      <button type="button" className={styles.textButton} onClick={onAdvanced}>{t('aiSettings.advancedOpen')}</button>
    </div>
  </section>
}

/** 右側說明卡：失敗時換成對應的那張（A10 額度、A11 金鑰、A12 連不上）。 */
function SideCard({ code, replacing, adapter }: { code: string | null; replacing: boolean; adapter: string }) {
  const { t } = useT('teach')
  const [title, body] = code === 'AI_CONNECTION_QUOTA' ? ['quotaTitle', 'quotaBody']
    : code === 'AI_CONNECTION_KEY_INVALID' ? ['keySourceTitle', 'keySourceBody']
      : code === 'AI_CONNECTION_UNREACHABLE' || code === 'AI_CONNECTION_TIMEOUT' ? ['offlineTitle', 'offlineBody']
        : replacing ? ['replaceTitle', 'replaceBody'] : ['explainTitle', 'explainBody']
  return <aside className={`${styles.card} ${styles.panel} ${styles.side}`}>
    <h2 className={styles.cardTitle}>{t(`aiSettings.${title}`)}</h2>
    <p className={styles.meta}>{t(`aiSettings.${body}`)}</p>
    {code === 'AI_CONNECTION_QUOTA' && <TopUp adapter={adapter} />}
  </aside>
}
