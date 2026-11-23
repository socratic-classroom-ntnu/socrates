import type { ReactNode } from 'react'
import styles from './AIConnection.module.css'

const ICONS = {
  done: <path d="M9 12.5l2 2 4-4.5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />,
  warning: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17h.01" /></>,
  error: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></>,
}

/**
 * Figma 元件「提示訊息」（完成、需要注意、錯誤）：一行、圖示＋粗體 13px。
 * src/ui 還沒有這個元件（之後的錯誤訊息統一需求會做），這頁自己用的，不放進 src/ui。
 */
export function ConnectionAlert({ tone, role, children }: { tone: 'done' | 'warning' | 'error'; role?: 'status'; children: ReactNode }) {
  return <div className={styles.alert} data-tone={tone} role={role ?? (tone === 'error' ? 'alert' : tone === 'warning' ? 'status' : undefined)}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[tone]}</svg>
    <span>{children}</span>
  </div>
}
