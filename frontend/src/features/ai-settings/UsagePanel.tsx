import type { AIConnectionUsageView } from '../../contract/classroomClient'
import { useT } from '../../i18n/useT'
import { Button } from '../../ui'
import styles from './AIConnection.module.css'
import { CONSOLES, COMPATIBLE, dollars, useServiceName } from './aiConnectionServices'

export type Usage = { state: 'loading' } | { state: 'ready'; usage: AIConnectionUsageView }

/** Share of the limit used, 0–1; null without a limit. Nothing left counts as all used. */
export function usedShare(usage: AIConnectionUsageView): number | null {
  if (usage.status !== 'ok' || usage.limit == null || usage.remaining == null || usage.limit <= 0) return null
  return Math.min(1, Math.max(0, (usage.limit - usage.remaining) / usage.limit))
}

/**
 * 我的用量（A08、C01–C04）：只在自己的金鑰在用時顯示。OpenRouter 有上限給已用／上限／剩餘，
 * 沒上限只給已用；其他服務查不到；查詢失敗另外一種。進頁面查一次，「重新整理」再查。
 */
export function UsagePanel({ usage, adapter, onRefresh }: { usage: Usage; adapter: string; onRefresh: () => void }) {
  const { t } = useT('teach')
  const serviceName = useServiceName()
  const service = serviceName(adapter)
  const consoleLink = CONSOLES[adapter] && adapter !== COMPATIBLE
    ? <a className={styles.link} href={CONSOLES[adapter]} target="_blank" rel="noreferrer">{t('aiSettings.openConsole', { service })}</a>
    : null
  return <section className={`${styles.card} ${styles.usage}`} aria-labelledby="ai-usage-title" aria-busy={usage.state === 'loading'}>
    <div className={styles.usageHead}>
      <h2 id="ai-usage-title" className={styles.cardTitle}>{t('aiSettings.usageTitle')}</h2>
      <span className={styles.meta}>{t('aiSettings.usageMeta', { service })}</span>
    </div>
    {usage.state === 'loading' ? <p className={styles.meta}>{t('aiSettings.loading')}</p> : <Body usage={usage.usage} consoleLink={consoleLink} onRefresh={onRefresh} />}
  </section>
}

function Body({ usage, consoleLink, onRefresh }: { usage: AIConnectionUsageView; consoleLink: React.ReactNode; onRefresh: () => void }) {
  const { t } = useT('teach')
  if (usage.status === 'unsupported') {
    return <div className={styles.usageNote}><b>{t('aiSettings.unsupported')}</b>{consoleLink}</div>
  }
  if (usage.status === 'failed') {
    return <div className={styles.usageNote}>
      <b>{t('aiSettings.usageFailed')}</b>
      <span className={styles.meta}>{t('aiSettings.usageFailedBody')}</span>
      <Button variant="outline" onClick={onRefresh}>{t('aiSettings.retry')}</Button>
    </div>
  }
  const share = usedShare(usage)
  const refresh = <p className={styles.meta}>
    {t('aiSettings.justNow')}・<button type="button" className={styles.textButton} onClick={onRefresh}>{t('aiSettings.refresh')}</button>
  </p>
  if (share === null) {
    return <>
      <dl className={styles.numbers}><div><dt>{t('aiSettings.used')}</dt><dd>{dollars(usage.used ?? 0)}</dd></div></dl>
      <p className={styles.meta}>{t('aiSettings.noLimit')}</p>
      {refresh}
    </>
  }
  const percent = (share * 100).toFixed(1)
  return <>
    <dl className={styles.numbers}>
      <div><dt>{t('aiSettings.used')}</dt><dd>{dollars(usage.used ?? 0)}</dd></div>
      <div>
        <dt>{t('aiSettings.limit')}</dt><dd>{dollars(usage.limit ?? 0)}</dd>
        {usage.limit_reset && <span className={styles.meta}>{t(`aiSettings.reset_${usage.limit_reset}`)}</span>}
      </div>
      <div><dt>{t('aiSettings.remaining')}</dt><dd className={styles.remaining}>{dollars(usage.remaining ?? 0)}</dd></div>
    </dl>
    <div className={styles.bar} role="progressbar" aria-label={t('aiSettings.used')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(percent)}>
      <span style={{ width: `${percent}%` }} />
    </div>
    <div className={styles.usageFoot}><span className={styles.meta}>{t('aiSettings.usedPercent', { percent })}</span>{consoleLink}</div>
    {refresh}
  </>
}
