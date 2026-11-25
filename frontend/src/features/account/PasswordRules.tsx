import { useT } from '../../i18n/useT'
import { PASSWORD_RULE_KEYS, evaluatePasswordRules } from './passwordChecks'
import styles from './PasswordRules.module.css'

/**
 * 新密碼的三條規則，逐條打勾（Figma 元件庫「密碼規則」）。只吃目前輸入的密碼、自己算，
 * 不跟對話框的狀態綁在一起：之後註冊頁也要用，到時搬進 ui。
 */
export function PasswordRules({ password, id }: { password: string; id?: string }) {
  const { t } = useT('shell')
  const met = evaluatePasswordRules(password)
  return <ul id={id} className={styles.rules} aria-label={t('accountSettings.passwordDialog.rulesLabel')}>
    {PASSWORD_RULE_KEYS.map(key => <li key={key} data-met={met[key]} className={met[key] ? styles.met : styles.unmet}>
      <span className={styles.icon} aria-hidden="true">{met[key] ? '✓' : '!'}</span>
      <span>{t(`accountSettings.passwordDialog.rules.${key}`)}</span>
      <span className="sr-only">{t(`accountSettings.passwordDialog.${met[key] ? 'met' : 'unmet'}`)}</span>
    </li>)}
  </ul>
}
