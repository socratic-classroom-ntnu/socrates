import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import '../styles/menu.css'

export type MenuItem = {
  key: string
  label: string
  onSelect(): void
  danger?: boolean
  dividerBefore?: boolean
  submenu?: MenuItem[]
  /** Set on items of a single-choice group; they render as menuitemradio. */
  checked?: boolean
  icon?: ReactNode
}

type Props = {
  /** Accessible name of both the trigger and the menu. */
  label: string
  trigger: ReactNode
  items: MenuItem[]
  align?: 'start' | 'end'
  /** Where the menu opens relative to the trigger. */
  placement?: 'below' | 'above'
  triggerClassName?: string
  /** Extra content at the top of the menu, such as the account header in S2. */
  header?: ReactNode
  disabled?: boolean
}

/** Accessible dropdown: arrows move, Enter/Space select, → opens a submenu, Esc and outside clicks close. */
export function Menu({ label, trigger, items, align = 'start', placement = 'below', triggerClassName = '', header, disabled = false }: Props) {
  const [open, setOpen] = useState(false)
  const [subKey, setSubKey] = useState<string | null>(null)
  const wrapper = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const mainRefs = useRef<(HTMLElement | null)[]>([])
  const subRefs = useRef<(HTMLElement | null)[]>([])
  const pendingFocus = useRef<'main' | 'sub' | null>(null)
  const id = useId()
  const sub = items.find(item => item.key === subKey)?.submenu ?? null

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent | TouchEvent) => {
      if (event.target instanceof Node && wrapper.current?.contains(event.target)) return
      close(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  useEffect(() => {
    if (pendingFocus.current === 'main') mainRefs.current.find(Boolean)?.focus()
    if (pendingFocus.current === 'sub') subRefs.current.find(Boolean)?.focus()
    pendingFocus.current = null
  })

  function close(returnFocus = true) {
    setOpen(false)
    setSubKey(null)
    if (returnFocus) button.current?.focus()
  }

  function toggle() {
    if (open) return close()
    pendingFocus.current = 'main'
    setSubKey(null)
    setOpen(true)
  }

  function openSub(item: MenuItem) {
    pendingFocus.current = 'sub'
    setSubKey(item.key)
  }

  function choose(item: MenuItem) {
    if (item.submenu) return openSub(item)
    close()
    item.onSelect()
  }

  function onKeyDown(event: KeyboardEvent) {
    const inSub = sub !== null && subRefs.current.some(node => node === document.activeElement)
    const list = (inSub ? subRefs.current : mainRefs.current).filter((node): node is HTMLElement => Boolean(node))
    const current = list.indexOf(document.activeElement as HTMLElement)
    const entries = inSub ? sub : items
    const focused = current >= 0 ? entries[current] : undefined
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      list[(current + step + list.length) % list.length]?.focus()
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      list[event.key === 'Home' ? 0 : list.length - 1]?.focus()
    } else if (event.key === 'ArrowRight' && !inSub && focused?.submenu) {
      event.preventDefault()
      openSub(focused)
    } else if ((event.key === 'ArrowLeft' || event.key === 'Escape') && inSub) {
      event.preventDefault()
      const parent = items.findIndex(item => item.key === subKey)
      setSubKey(null)
      mainRefs.current[parent]?.focus()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if ((event.key === 'Enter' || event.key === ' ') && focused) {
      event.preventDefault()
      choose(focused)
    } else if (event.key === 'Tab') {
      close(false)
    }
  }

  function renderItems(list: MenuItem[], refs: typeof mainRefs) {
    refs.current = []
    return list.map((item, index) => <li key={item.key} role="none">
      {item.dividerBefore && <div role="separator" className="menu__divider" />}
      <button
        type="button"
        ref={node => { refs.current[index] = node }}
        role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
        aria-checked={item.checked === undefined ? undefined : item.checked}
        aria-haspopup={item.submenu ? 'menu' : undefined}
        aria-expanded={item.submenu ? subKey === item.key : undefined}
        tabIndex={-1}
        className={'menu__item' + (item.danger ? ' menu__item--danger' : '') + (item.checked ? ' menu__item--checked' : '')}
        onClick={() => choose(item)}
      >
        {item.icon}<span className="menu__label">{item.label}</span>
        {item.submenu && <span className="menu__chevron" aria-hidden="true">›</span>}
        {item.checked && <span className="menu__check" aria-hidden="true">✓</span>}
      </button>
    </li>)
  }

  return <div className={`menu menu--${align} menu--${placement}`} ref={wrapper}>
    <button
      type="button"
      ref={button}
      className={triggerClassName}
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? id : undefined}
      disabled={disabled}
      onClick={toggle}
    >{trigger}</button>
    {open && <div id={id} role="menu" aria-label={label} className="menu__panel" onKeyDown={onKeyDown}>
      {header}
      <ul className="menu__list" role="none">{renderItems(items, mainRefs)}</ul>
      {sub && <ul role="menu" aria-label={items.find(item => item.key === subKey)?.label} className="menu__panel menu__panel--sub">
        {renderItems(sub, subRefs)}
      </ul>}
    </div>}
  </div>
}
