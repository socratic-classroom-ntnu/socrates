import type { ReactNode } from 'react'
import { classNames } from '../classNames'
import styles from './StatusPill.module.css'

export type StatusPillTone = 'open' | 'scheduled' | 'draft' | 'ended' | 'quiet'

export function StatusPill({ tone, className, children }: { tone: StatusPillTone; className?: string; children: ReactNode }) {
  return <span className={classNames(styles.pill, styles[tone], className)}>{children}</span>
}
