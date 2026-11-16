import { forwardRef, type InputHTMLAttributes, useState } from 'react'
import { useT } from '../../i18n/useT'
import { classNames } from '../classNames'
import { IconButton } from '../IconButton/IconButton'
import styles from './PasswordInput.module.css'

// 線條圖示 18px、線寬 1.5（跟 Figma「提示訊息」的圖示同一套）
const EYE = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />
</svg>
const EYE_OFF = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.7 3.6" /><path d="M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
  <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="m3 3 18 18" />
</svg>

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

/**
 * 密碼欄＋右側的眼睛按鈕。預設遮住，按眼睛切換明碼；其餘 props 與 ref 都給 <input>。
 * 外框、標題、說明、錯誤照舊由呼叫端放（Field 或頁面自己的 label）。
 */
export const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput({ className, disabled, ...rest }, ref) {
  const { t } = useT('common')
  const [shown, setShown] = useState(false)
  return <span className={styles.wrapper}>
    <input ref={ref} {...rest} type={shown ? 'text' : 'password'} disabled={disabled} className={classNames(styles.input, className)} />
    <IconButton
      tone="quiet"
      className={styles.toggle}
      label={t(shown ? 'password.hide' : 'password.show')}
      aria-pressed={shown}
      disabled={disabled}
      onClick={() => setShown(value => !value)}
    >
      {shown ? EYE_OFF : EYE}
    </IconButton>
  </span>
})
