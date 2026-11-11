import type { ButtonHTMLAttributes } from 'react'
import { classNames } from '../classNames'
import styles from './IconButton.module.css'

export type IconButtonTone = 'default' | 'quiet'

export function iconButtonClass(tone: IconButtonTone = 'default', className?: string): string {
  return classNames(styles.iconButton, tone === 'quiet' && styles.quiet, className)
}

/** 只有圖示的按鈕：label 是無障礙名稱（aria-label），圖示本身要 aria-hidden */
export function IconButton({ label, tone, className, type = 'button', ...rest }: { label: string; tone?: IconButtonTone } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} aria-label={label} className={iconButtonClass(tone, className)} {...rest} />
}
