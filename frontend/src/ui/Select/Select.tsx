import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useT } from '../../i18n/useT'
import { classNames } from '../classNames'
import styles from './Select.module.css'

export type SelectOption = {
  value: string
  label: string
  /** A second, smaller line (e.g. a model's provider). */
  description?: string
  /** Something on the right of the option (e.g. a small tag). */
  badge?: ReactNode
}

type Item = { kind: 'option'; option: SelectOption } | { kind: 'typed'; text: string }

const CHEVRON = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
const SPINNER = <svg className={styles.spinner} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9" /></svg>
/** How long an Enter that only searched shows the spin before the result line comes back. */
export const SEARCH_SPIN_MS = 400

const CHECK = <svg className={styles.check} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>

/**
 * 下拉選單：按鈕顯示目前的選項，展開後是我們自己畫的清單（不是瀏覽器原生的 <select>），選中的打勾。
 * 可加搜尋框（`search`）、允許直接用搜尋框打的字（`typedLabel`）、在清單上方放一行說明（`note`）。
 * 外框、標題、錯誤照舊用 Field；按鈕的 id 等於 Field 的 id。
 */
export function Select({
  id, value, options, onChange, listLabel, placeholder, disabled, invalid, describedBy, search, typedLabel, note, align = 'start', className,
}: {
  id: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  /** The list's accessible name (usually the field's label). */
  listLabel: string
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
  search?: { label: string; placeholder: string }
  /** With `search`: the extra last option that uses what was typed, e.g. text => `使用「${text}」`. */
  typedLabel?: (text: string) => string
  /** A line above the options; a function gets what was typed and how many options match. */
  note?: ReactNode | ((state: { query: string; matches: number }) => ReactNode)
  /** Which edge the open list lines up with; `end` lets a wide list grow to the left. */
  align?: 'start' | 'end'
  className?: string
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const { t } = useT('common')
  // An Enter that only searched briefly turns the note line into a spinner, as feedback.
  const [spinning, setSpinning] = useState(false)
  const spinTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (spinTimer.current) clearTimeout(spinTimer.current) }, [])
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const current = options.find(option => option.value === value)

  const items = useMemo<Item[]>(() => {
    const needle = query.trim().toLowerCase()
    const shown: Item[] = options
      .filter(option => !needle || [option.label, option.value, option.description ?? ''].some(text => text.toLowerCase().includes(needle)))
      .map(option => ({ kind: 'option', option }))
    const typed = query.trim()
    return typedLabel && typed && !options.some(option => option.value === typed) ? [...shown, { kind: 'typed', text: typed }] : shown
  }, [options, query, typedLabel])

  useEffect(() => {
    if (!open) return
    if (!search) list.current?.focus()
    function away(event: MouseEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open, search])

  // With a search box nothing is highlighted until ↑↓ is used, so Enter after typing keeps
  // searching instead of picking whatever happens to be first. Without one, the current option is.
  const NONE = -1

  function show() {
    setQuery('')
    setSpinning(false)
    setActive(search ? NONE : Math.max(0, options.findIndex(option => option.value === value)))
    setOpen(true)
  }

  function spin() {
    if (spinTimer.current) clearTimeout(spinTimer.current)
    setSpinning(true)
    spinTimer.current = setTimeout(() => setSpinning(false), SEARCH_SPIN_MS)
  }

  function close() {
    setOpen(false)
    trigger.current?.focus()
  }

  function pick(item: Item) {
    const next = item.kind === 'option' ? item.option.value : item.text
    if (next !== value) onChange(next)
    close()
  }

  function triggerKeys(event: KeyboardEvent<HTMLButtonElement>) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); show() }
  }

  function listKeys(event: KeyboardEvent<HTMLElement>) {
    const last = items.length - 1
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(index + 1, Math.max(last, 0))) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(index - 1, 0)) }
    else if (event.key === 'Enter') {
      // The Enter that confirms a word in an input method (Chinese, Japanese…) is not a pick.
      if (event.nativeEvent.isComposing || event.keyCode === 229) return
      event.preventDefault()
      const item = active === NONE ? undefined : items[Math.min(active, last)]
      if (item) pick(item)
      else spin()
    }
    else if (event.key === 'Escape') { event.preventDefault(); close() }
    else if (event.key === 'Tab') setOpen(false)
  }

  const optionId = (index: number) => `${listId}-${index}`
  const activeId = items.length && active !== NONE ? optionId(Math.min(active, items.length - 1)) : undefined
  return <div className={classNames(styles.select, className)} ref={root}>
    <button
      ref={trigger}
      id={id}
      type="button"
      className={styles.trigger}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => (open ? setOpen(false) : show())}
      onKeyDown={triggerKeys}
    >
      <span className={value ? styles.value : styles.placeholder}>{current?.label ?? (value || placeholder)}</span>
      {CHEVRON}
    </button>
    {open && <div className={classNames(styles.popup, align === 'end' && styles.alignEnd)}>
      {search && <input
        autoFocus
        role="combobox"
        type="search"
        autoComplete="off"
        // A text box right above a password field reads as a username field to browsers and
        // password managers; this one is a search box (1Password, LastPass, Bitwarden marks).
        data-1p-ignore
        data-lpignore="true"
        data-bwignore
        aria-label={search.label}
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={activeId}
        className={styles.search}
        placeholder={search.placeholder}
        value={query}
        onChange={event => { setQuery(event.target.value); setActive(NONE) }}
        onKeyDown={listKeys}
      />}
      {note && <p className={styles.note} aria-live="polite">{spinning
        ? <span className={styles.searching}>{SPINNER}{t('select.searching')}</span>
        : typeof note === 'function' ? note({ query: query.trim(), matches: items.filter(item => item.kind === 'option').length }) : note}</p>}
      <ul
        ref={list}
        id={listId}
        role="listbox"
        tabIndex={search ? undefined : -1}
        aria-label={listLabel}
        aria-activedescendant={search ? undefined : activeId}
        className={styles.list}
        onKeyDown={search ? undefined : listKeys}
      >
        {items.map((item, index) => item.kind === 'option'
          ? <li
              key={item.option.value}
              id={optionId(index)}
              role="option"
              aria-selected={item.option.value === value}
              data-value={item.option.value}
              data-active={index === active}
              className={styles.option}
              onMouseDown={event => event.preventDefault()}
              onClick={() => pick(item)}
            >
              <span className={styles.text}>
                <b>{item.option.label}</b>
                {item.option.description && <span className={styles.description}>{item.option.description}</span>}
              </span>
              {item.option.badge}
              {item.option.value === value && CHECK}
            </li>
          : <li
              key="typed"
              id={optionId(index)}
              role="option"
              aria-selected={false}
              data-active={index === active}
              className={styles.option}
              onMouseDown={event => event.preventDefault()}
              onClick={() => pick(item)}
            >{typedLabel?.(item.text)}</li>)}
      </ul>
    </div>}
  </div>
}
