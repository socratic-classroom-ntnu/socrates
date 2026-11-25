import type { ReactNode } from 'react'
import { Dialog } from '../../components/Dialog'
import { useT } from '../../i18n/useT'
import { useHideShellNav } from '../../shared/shellContext'
import styles from './AccountFrame.module.css'

export type FrameVariant = 'dialog' | 'page'

type Props = {
  /** `dialog`：電腦版的確認視窗；`page`：手機的內頁（Figma M02–M07、M10–M16） */
  variant: FrameVariant
  title: string
  onClose(): void
  /** 底部按鈕：對話框的頁尾，內頁固定在最下面的按鈕列（左次要、右主要） */
  footer?: ReactNode
  /** 步驟（頭像 1／2／3、刪除帳號 1／2），在標題下面 */
  steps?: ReactNode
  tone?: 'default' | 'danger'
  closeOnBackdrop?: boolean
  children: ReactNode
}

/** 個人設定三個流程（頭像、變更密碼、刪除帳號）共用的外框：內容同一份，電腦與手機各套一層。 */
export function AccountFrame({ variant, ...props }: Props) {
  return variant === 'page' ? <AccountPage {...props} /> : <AccountDialog {...props} />
}

function AccountDialog({ title, onClose, footer, steps, tone, closeOnBackdrop, children }: Omit<Props, 'variant'>) {
  return <Dialog title={title} onClose={onClose} footer={footer} tone={tone} closeOnBackdrop={closeOnBackdrop} description={steps}>
    {children}
  </Dialog>
}

function AccountPage({ title, onClose, footer, steps, children }: Omit<Props, 'variant'>) {
  const { t } = useT('shell')
  useHideShellNav()
  return <main className={styles.page}>
    <div className={styles.titleRow}>
      <button type="button" className={styles.back} aria-label={t('accountSettings.back')} onClick={onClose}>
        <span aria-hidden="true">‹</span>
      </button>
      <h1>{title}</h1>
    </div>
    {steps && <div className={styles.steps}>{steps}</div>}
    <div className={styles.body}>{children}</div>
    {/* 回饋按鈕浮在按鈕列上方，不壓住右邊的主要按鈕（features/feedback/placement.ts） */}
    {footer && <div className={styles.actions} data-feedback-avoid>{footer}</div>}
  </main>
}
