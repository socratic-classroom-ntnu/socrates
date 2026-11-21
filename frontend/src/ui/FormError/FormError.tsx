import type { HTMLAttributes } from 'react'
import { classNames } from '../classNames'
import styles from './FormError.module.css'

export function FormError({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={classNames(styles.formError, className)} {...rest} />
}
