import { type ReactNode, useEffect, useState } from 'react'
import { useT } from '../../i18n/useT'
import { buttonClass, type ButtonVariant } from '../Button/Button'
import { iconButtonClass, type IconButtonTone } from '../IconButton/IconButton'
import styles from './CopyButton.module.css'

type Props = {
  text: string
  label: string
  /** Show only the icon; `label` becomes the accessible name. */
  iconOnly?: boolean
  /** 有文字時的按鈕外觀 */
  variant?: ButtonVariant
  /** 只有圖示時的按鈕外觀 */
  tone?: IconButtonTone
  /** 不套按鈕外觀，只用頁面的 className（加入頁黑板上的複製鈕） */
  unstyled?: boolean
  className?: string
  icon?: ReactNode
}

const COPY_ICON = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>

export function CopyButton({ text, label, iconOnly = false, variant, tone, unstyled = false, className, icon = COPY_ICON }: Props) {
  const { t } = useT('common')
  const [result, setResult] = useState<'copied' | 'copyFailed' | null>(null)
  useEffect(() => {
    if (!result) return
    const timer = setTimeout(() => setResult(null), 2000)
    return () => clearTimeout(timer)
  }, [result])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setResult('copied')
    } catch {
      setResult('copyFailed')
    }
  }

  return <span className={styles.copyButton}>
    <button type="button" className={unstyled ? className : iconOnly ? iconButtonClass(tone, className) : buttonClass(variant, className)} aria-label={iconOnly ? label : undefined} title={iconOnly ? label : undefined} onClick={() => void copy()}>
      {icon}{!iconOnly && <span>{label}</span>}
    </button>
    {result && <span role="status" className={styles.status}>{t(result)}</span>}
  </span>
}
