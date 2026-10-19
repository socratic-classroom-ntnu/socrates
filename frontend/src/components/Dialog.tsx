import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { useT } from '../i18n/useT'
import '../styles/ui.css'
import '../styles/dialog.css'

type Props = {
  title: string
  onClose(): void
  children: ReactNode
  footer?: ReactNode
  /** Short explanation under the title (T2b). */
  description?: ReactNode
  tone?: 'default' | 'danger'
  /** `right` is the T1 drawer; `center` the T2b/T4b dialogs. */
  placement?: 'center' | 'right'
  /** `false` keeps the dialog open when the dimmed backdrop is clicked (T1: typed content survives). */
  closeOnBackdrop?: boolean
}

// 開著的對話框；鍵盤只交給最上面那一個。序號在 render 時就決定，巢狀時父層先拿到較小的號碼
// （子元件的 effect 比父元件先跑，不能用 push 的順序判斷）
let sequence = 0
const open = new Set<number>()

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Modal dialog: dims the page, keeps Tab inside, closes on Esc and ×, and gives focus back to
 * whatever opened it. An element marked `data-autofocus` gets the first focus.
 */
export function Dialog({ title, onClose, children, footer, description, tone = 'default', placement = 'center', closeOnBackdrop = true }: Props) {
  const { t } = useT('common')
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const close = useRef(onClose)
  const [order] = useState(() => ++sequence)
  close.current = onClose

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const target = panel.current?.querySelector<HTMLElement>('[data-autofocus]')
      ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE)
    target?.focus()
    open.add(order)
    // 監聽 document：點到說明文字或圖片時焦點會落到 body，Esc 和 Tab 仍然要有效
    function onKeyDown(event: KeyboardEvent) {
      if (Math.max(...open) !== order || !panel.current) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const inside = panel.current.contains(document.activeElement)
      if (!inside) { event.preventDefault(); (event.shiftKey ? last : first).focus() }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      open.delete(order)
      opener?.focus?.()
    }
  }, [order])

  return <div className={`dialog dialog--${placement}`} onMouseDown={event => { if (closeOnBackdrop && event.target === event.currentTarget) onClose() }}>
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={`dialog__panel dialog__panel--${tone}`}
    >
      <header className="dialog__header">
        {tone === 'danger' && <span className="dialog__alert" aria-hidden="true">!</span>}
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="dialog__close" aria-label={t('close')} onClick={onClose}>×</button>
      </header>
      {description && <div className="dialog__description">{description}</div>}
      <div className="dialog__body">{children}</div>
      {footer && <footer className="dialog__footer">{footer}</footer>}
    </div>
  </div>
}
