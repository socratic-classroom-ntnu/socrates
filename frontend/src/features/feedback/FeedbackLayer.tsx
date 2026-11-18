import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useT } from '../../i18n/useT'
import { useIsPhone } from '../../shared/useIsPhone'
import styles from './Feedback.module.css'
import { FeedbackDialog } from './FeedbackDialog'
import { hiddenOn } from './hiddenOn'
import { useFloatingBottom } from './placement'

const THANKS_MS = 3000

const bubbleIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /><path d="M9 9v3M12 9v3M15 9v3" /></svg>
const checkIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>

/**
 * 每一頁右下角的意見回饋按鈕（spec P1、P2、P13）：掛在 App 的路由旁邊，登入前的頁面也有；
 * 掃描頁與投影頁不顯示。手機上縮小、半透明，浮在底部導覽或輸入區上方。
 */
export function FeedbackLayer() {
  const { t } = useT('feedback')
  const { pathname } = useLocation()
  const phone = useIsPhone()
  const [open, setOpen] = useState(false)
  const [thanks, setThanks] = useState(false)
  const hidden = hiddenOn(pathname)
  const size = phone ? 44 : 56
  const right = phone ? 16 : 28
  const bottom = useFloatingBottom(phone ? 16 : 28, size, right, !hidden)

  useEffect(() => {
    if (!thanks) return
    const timer = setTimeout(() => setThanks(false), THANKS_MS)
    return () => clearTimeout(timer)
  }, [thanks])

  if (hidden) return null
  return <>
    <button
      type="button"
      className={phone ? `${styles.fab} ${styles.phone}` : styles.fab}
      style={{ bottom }}
      aria-label={t('button')}
      aria-haspopup="dialog"
      onClick={() => { setThanks(false); setOpen(true) }}
    >
      {bubbleIcon}
      <span className={styles.tooltip} aria-hidden="true">{t('button')}</span>
    </button>
    {thanks && <div role="status" className={styles.toast} style={{ bottom: bottom + (size - 44) / 2, right: right + size + 16 }}>
      {checkIcon}{t('sent')}
    </div>}
    {open && <FeedbackDialog phone={phone} onClose={() => setOpen(false)} onSent={() => { setOpen(false); setThanks(true) }} />}
  </>
}
