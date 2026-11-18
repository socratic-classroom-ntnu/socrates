import type { ReactNode, Ref } from 'react'
import { Link } from 'react-router-dom'
import { classNames } from '../classNames'
import styles from './BottomNav.module.css'

/** 一格：有 `to` 是導頁連結，否則是按鈕（例如「我」打開帳號面板）。 */
export type BottomNavItem = {
  key: string
  label: string
  icon: ReactNode
  to?: string
  current?: boolean
  onSelect?(): void
  /** 按鈕打開的面板開著時為 true（aria-expanded），外觀同選取中。 */
  expanded?: boolean
  /** 按鈕的 ref：面板關掉後把焦點還給它（iOS Safari 點按鈕不會讓它取得焦點）。 */
  buttonRef?: Ref<HTMLButtonElement>
}

/** 手機底部導覽（學生端，畫布 S2sm／S5m）：固定在最下方，最多四格，留出 iPhone 的安全區。 */
export function BottomNav({ label, items, className }: { label: string; items: BottomNavItem[]; className?: string }) {
  // data-feedback-avoid：意見回饋按鈕浮在它上方
  return <nav aria-label={label} className={classNames(styles.nav, className)} data-feedback-avoid="">
    {items.map(item => {
      const body = <>
        {(item.current || item.expanded) && <span className={styles.marker} aria-hidden="true" />}
        <span className={styles.icon} aria-hidden="true">{item.icon}</span>
        <span>{item.label}</span>
      </>
      const active = classNames(styles.item, (item.current || item.expanded) && styles.active)
      return item.to !== undefined
        ? <Link key={item.key} to={item.to} className={active} aria-current={item.current ? 'page' : undefined}>{body}</Link>
        : <button key={item.key} ref={item.buttonRef} type="button" className={active} aria-haspopup="dialog" aria-expanded={!!item.expanded} onClick={item.onSelect}>{body}</button>
    })}
  </nav>
}
