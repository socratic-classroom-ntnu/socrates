import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { classNames } from '../classNames'
import styles from './Chip.module.css'

/** 可切換的篩選 chip：選中狀態用 aria-pressed 表示 */
export function Chip({ pressed, className, type = 'button', ...rest }: { pressed: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} aria-pressed={pressed} className={classNames(styles.chip, className)} {...rest} />
}

/** 一排 chip：有名稱的 group */
export function ChipGroup({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return <div role="group" aria-label={label} className={classNames(styles.chips, className)}>{children}</div>
}
