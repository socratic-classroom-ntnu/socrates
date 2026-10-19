import { type ReactNode, useEffect, useState } from 'react'
import { useT } from '../i18n/useT'

type Props = {
  text: string
  label: string
  /** Show only the icon; `label` becomes the accessible name. */
  iconOnly?: boolean
  className?: string
  icon?: ReactNode
}

const COPY_ICON = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>

export function CopyButton({ text, label, iconOnly = false, className = '', icon = COPY_ICON }: Props) {
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

  return <span className="copy-button">
    <button type="button" className={className} aria-label={iconOnly ? label : undefined} title={iconOnly ? label : undefined} onClick={() => void copy()}>
      {icon}{!iconOnly && <span>{label}</span>}
    </button>
    {result && <span role="status" className="copy-button__status">{t(result)}</span>}
  </span>
}
