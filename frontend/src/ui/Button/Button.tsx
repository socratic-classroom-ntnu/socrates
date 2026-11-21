import type { ButtonHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { classNames } from '../classNames'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'outline' | 'quiet' | 'dark' | 'danger'

/** 按鈕外觀的 class；CopyButton 這類自己渲染 <button> 的元件也用它 */
export function buttonClass(variant?: ButtonVariant, className?: string): string {
  return classNames(styles.button, variant && styles[variant], className)
}

/** 頁面要覆寫外觀，就傳自己的 className（載入順序在元件之後，所以蓋得過） */
export function Button({ variant, className, type = 'button', ...rest }: { variant?: ButtonVariant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={buttonClass(variant, className)} {...rest} />
}

/** 導頁用連結，外觀跟 Button 一樣 */
export function ButtonLink({ variant, className, ...rest }: { variant?: ButtonVariant } & LinkProps) {
  return <Link className={buttonClass(variant, className)} {...rest} />
}
