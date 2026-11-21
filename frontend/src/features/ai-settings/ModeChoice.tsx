import { useT } from '../../i18n/useT'
import styles from './AIConnection.module.css'

export type Mode = 'system' | 'own'

/**
 * 「系統提供／自己的金鑰」兩張單選卡。
 * TODO(個人設定需求)：`ui/RadioCards` 進 develop 後換成它（需求：單選卡用個人設定那份做的，不另做）。
 * 在那之前只用原生 radio 撐住行為與測試，不做成共用元件、不放進 src/ui。
 */
export function ModeChoice({ value, systemDisabled, busy, onChoose }: {
  value: Mode
  systemDisabled: boolean
  busy: boolean
  onChoose: (mode: Mode) => void
}) {
  const { t } = useT('teach')
  const option = (mode: Mode, label: string, note: string, disabled: boolean) =>
    <label className={styles.modeCard} data-checked={value === mode} data-disabled={disabled}>
      <input type="radio" name="ai-mode" value={mode} checked={value === mode} disabled={disabled || busy} onChange={() => onChoose(mode)} />
      <span><b>{label}</b><span className={styles.meta}>{note}</span></span>
    </label>
  return <fieldset className={styles.modes}>
    <legend className={styles.srOnly}>{t('aiSettings.modeLabel')}</legend>
    {option('system', t('aiSettings.system'), t(systemDisabled ? 'aiSettings.systemOff' : 'aiSettings.systemNote'), systemDisabled)}
    {option('own', t('aiSettings.own'), t('aiSettings.ownNote'), false)}
  </fieldset>
}
