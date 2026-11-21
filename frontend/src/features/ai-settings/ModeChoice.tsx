import { useT } from '../../i18n/useT'
import styles from './AIConnection.module.css'

export type Mode = 'system' | 'own'

type RadioCardOption<T extends string> = { value: T; label: string; description?: string; disabled?: boolean }

/**
 * 暫代 `ui/RadioCards`（分支 feature/ui-radio-card，還沒進 develop）。props 與 HTML 結構照它寫：
 * fieldset > legend > .options > label.card > input＋.content（.label、.description），
 * 進 develop 後把這個函式換成 `import { RadioCards } from '../../ui'` 就好；這頁的大小（Figma 1364:28963：
 * 兩欄、54 高、14／13px）要靠它之後加的 className。不放進 src/ui。
 */
function RadioCards<T extends string>({ legend, name, options, value, onChange, disabled = false }: {
  legend: string
  name: string
  options: readonly RadioCardOption<T>[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
}) {
  return <fieldset className={styles.modes} disabled={disabled}>
    <legend className={styles.srOnly}>{legend}</legend>
    <div className={styles.modeOptions}>
      {options.map(option => <label key={option.value} className={styles.modeCard}>
        <input type="radio" name={name} value={option.value} checked={value === option.value} disabled={option.disabled} onChange={() => onChange(option.value)} />
        <span className={styles.modeContent}>
          <span className={styles.modeLabel}>{option.label}</span>
          {option.description && <span className={styles.modeDescription}>{option.description}</span>}
        </span>
      </label>)}
    </div>
  </fieldset>
}

/** 「系統提供／自己的金鑰」兩張單選卡。 */
export function ModeChoice({ value, systemDisabled, busy, onChoose }: {
  value: Mode
  systemDisabled: boolean
  busy: boolean
  onChoose: (mode: Mode) => void
}) {
  const { t } = useT('teach')
  return <RadioCards<Mode>
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
