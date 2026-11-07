import type { HTMLAttributes, ReactNode } from 'react'
import { classNames } from '../classNames'
import styles from './Field.module.css'

/** 必填的星號，只給看得到的人；念給螢幕報讀的「必填」由呼叫端另外放（Field 的 requiredText） */
export function RequiredMark() {
  return <span className={styles.star} aria-hidden="true"> *</span>
}

/**
 * 欄位外框與標題。控制項、說明、錯誤由各頁自己放進 children：各頁說明與錯誤的先後不同，
 * 這一輪維持現狀，等 Figma 定了再統一。控制項的 id 要等於這裡的 id，aria-describedby 也由呼叫端接。
 */
export function Field({ id, label, required, requiredText, invalid, className, children }: {
  id: string; label: ReactNode; required?: boolean; requiredText?: string; invalid?: boolean; className?: string; children: ReactNode
}) {
  return <div className={classNames(styles.field, invalid && styles.invalid, className)}>
    <label htmlFor={id}>{label}{required && <><RequiredMark />{requiredText && <span className="sr-only">{requiredText}</span>}</>}</label>
    {children}
  </div>
}

export function FieldHint({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={classNames(styles.hint, className)} {...rest} />
}

export function FieldError({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={classNames(styles.error, className)} {...rest} />
}
