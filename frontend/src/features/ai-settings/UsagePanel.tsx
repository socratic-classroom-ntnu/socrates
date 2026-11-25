import type { ReactNode } from 'react'
import type { AIConnectionUsageView } from '../../contract/classroomClient'
import { useT } from '../../i18n/useT'
import { Button } from '../../ui'
import styles from './AIConnection.module.css'
import { CONSOLES, COMPATIBLE, dollars, useServiceName } from './aiConnectionServices'

export { dollars }
export type Usage = { state: 'loading' } | { state: 'ready'; usage: AIConnectionUsageView }

/** Share of the limit used, 0–1; null without a limit. Nothing left counts as all used. */
export function usedShare(usage: AIConnectionUsageView): number | null {
  if (usage.status !== 'ok' || usage.limit == null || usage.remaining == null || usage.limit <= 0) return null
  return Math.min(1, Math.max(0, (usage.limit - usage.remaining) / usage.limit))
}

/**
 * 我的用量（Figma A08、C01–C04）：只在自己的金鑰在用時顯示。OpenRouter 有上限給已用／上限／剩餘，
 * 剩不到 10% 換成需要注意的顏色（C02）；沒上限只給已用（C01）；其他服務查不到（C03）；查詢失敗（C04）。
 * 進頁面查一次，「重新整理」再查。
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
      <h2 id="ai-usage-title" className={styles.usageTitle}>{t('aiSettings.usageTitle')}</h2>
      <span className={styles.small}>{t('aiSettings.usageMeta', { service })}</span>
    </div>
    {usage.state === 'loading'
      ? <p className={styles.meta}>{t('aiSettings.loading')}</p>
      : <Body usage={usage.usage} consoleLink={consoleLink} onRefresh={onRefresh} />}
  </section>
}

function Body({ usage, consoleLink, onRefresh }: { usage: AIConnectionUsageView; consoleLink: ReactNode; onRefresh: () => void }) {
  const { t } = useT('teach')
  const refresh = <p className={styles.small}>
    {t('aiSettings.justNow')}{'  ·  '}<button type="button" className={styles.refresh} onClick={onRefresh}>{t('aiSettings.refresh')}</button>
  </p>
  if (usage.status === 'unsupported') {
    return <>
      <p className={styles.usageNoteTitle}>{t('aiSettings.unsupported')}</p>
      <p className={styles.meta}>{t('aiSettings.unsupportedBody')}</p>
      {consoleLink && <div className={styles.usageFoot}>{consoleLink}</div>}
    </>
  }
  if (usage.status === 'failed') {
    return <>
      <p className={styles.usageNoteTitle}>{t('aiSettings.usageFailed')}</p>
      <p className={styles.meta}>{t('aiSettings.usageFailedBody')}</p>
      <div className={styles.usageFoot}>
        <Button variant="outline" onClick={onRefresh}>{t('aiSettings.retry')}</Button>
        {consoleLink}
      </div>
    </>
  }
  const share = usedShare(usage)
  if (share === null) {
    return <>
      <div className={styles.numbers}>
        <dl><div><dt>{t('aiSettings.used')}</dt><dd className={styles.bigNumber}>{dollars(usage.used ?? 0)}</dd></div></dl>
        <p className={styles.noLimit}>{t('aiSettings.noLimit')}</p>
      </div>
      <div className={styles.usageFoot}>{refresh}{consoleLink}</div>
    </>
  }
  const percent = (share * 100).toFixed(1)
  const low = (usage.remaining ?? 0) > 0 && share > 0.9
  return <div className={styles.limited} data-low={low}>
    <dl className={styles.numbers}>
      <div><dt>{t('aiSettings.used')}</dt><dd>{dollars(usage.used ?? 0)}</dd></div>
      <div>
        <dt>{t('aiSettings.limit')}</dt><dd>{dollars(usage.limit ?? 0)}</dd>
        {usage.limit_reset && <span className={styles.small}>{t(`aiSettings.reset_${usage.limit_reset}`)}</span>}
      </div>
      <div><dt>{t('aiSettings.remaining')}</dt><dd className={styles.remaining}>{dollars(usage.remaining ?? 0)}</dd></div>
    </dl>
    <div className={styles.bar} role="progressbar" aria-label={t('aiSettings.used')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(percent)}>
      <span style={{ width: `${percent}%` }} />
    </div>
    <div className={styles.usageFoot}>
      <span className={styles.small}>{t(low ? 'aiSettings.usedPercentShort' : 'aiSettings.usedPercent', { percent })}</span>
      {consoleLink}
    </div>
    {refresh}
  </div>
}
