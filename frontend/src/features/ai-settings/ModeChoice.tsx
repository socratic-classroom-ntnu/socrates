import { useT } from '../../i18n/useT'
import { RadioCards } from '../../ui'
import styles from './AIConnection.module.css'

export type Mode = 'system' | 'own'

/** 「系統提供／自己的金鑰」兩張單選卡：共用 RadioCards，大小照 Figma 1364:28963（兩欄、54 高、14／13px）由 .modes 改。 */
export function ModeChoice({ value, systemDisabled, busy, onChoose }: {
  value: Mode
  systemDisabled: boolean
  busy: boolean
  onChoose: (mode: Mode) => void
}) {
  const { t } = useT('teach')
  return <RadioCards<Mode>
    className={styles.modes}
    legend={t('aiSettings.modeLabel')}
    name="ai-mode"
    value={value}
    disabled={busy}
    onChange={onChoose}
    options={[
      { value: 'system', label: t('aiSettings.system'), description: t(systemDisabled ? 'aiSettings.systemOff' : 'aiSettings.systemNote'), disabled: systemDisabled },
      { value: 'own', label: t('aiSettings.own'), description: t('aiSettings.ownNote') },
    ]}
  />
}
