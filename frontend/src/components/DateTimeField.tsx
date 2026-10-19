import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { useT } from '../i18n/useT'
import { Dialog } from './Dialog'
import '../styles/date-time-field.css'

/** Same strings as the editor form: `YYYY-MM-DD` and 24-hour `HH:mm`, local time. */
export type DateTime = { date: string; time: string }

type Props = {
  id: string
  /** Already-translated name of the field, e.g. 「結束時間」. */
  label: string
  value: DateTime
  /** Exclusive lower bound besides "now" (the end must come after the start). */
  min?: DateTime
  onChange(value: DateTime): void
  disabled?: boolean
  readOnly?: boolean
  invalid?: boolean
  describedBy?: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const isoDate = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`
const parts = (date: string) => date.split('-').map(Number) as [number, number, number]
const local = (date: string) => { const [y, m, d] = parts(date); return new Date(y, m - 1, d) }
const shift = (date: string, days: number) => { const at = local(date); at.setDate(at.getDate() + days); return isoDate(at.getFullYear(), at.getMonth(), at.getDate()) }
const HOURS = Array.from({ length: 24 }, (_, h) => h)
const MINUTES = Array.from({ length: 60 }, (_, m) => m)

// 能選的時間都要晚於 floor（分鐘精度、不含 floor 本身）：現在這一分鐘，或比它晚的 min
function floorOf(min?: DateTime): DateTime {
  const now = new Date()
  const current = { date: isoDate(now.getFullYear(), now.getMonth(), now.getDate()), time: `${pad(now.getHours())}:${pad(now.getMinutes())}` }
  if (!min?.date || !min.time) return current
  return `${min.date} ${min.time}` > `${current.date} ${current.time}` ? min : current
}

function hoursOn(date: string, floor: DateTime): number[] {
  if (date > floor.date) return HOURS
  if (date < floor.date) return []
  const [h, m] = floor.time.split(':').map(Number)
  return HOURS.filter(hour => hour > h || (hour === h && m < 59))
}

function minutesAt(date: string, hour: number, floor: DateTime): number[] {
  if (date > floor.date) return MINUTES
  const [h, m] = floor.time.split(':').map(Number)
  return hour > h ? MINUTES : hour === h ? MINUTES.filter(minute => minute > m) : []
}

const selectable = (date: string, floor: DateTime) => hoursOn(date, floor).length > 0
// 月份用 Date 進位：12 月的下一個月是隔年 1 月
const monthKey = (y: number, m: number) => { const at = new Date(y, m, 1); return isoDate(at.getFullYear(), at.getMonth(), 1).slice(0, 7) }

/**
 * T3 start／end field (Figma 113:6144): one box with the date and the time. Opens a calendar
 * (113:6236), then a 24-hour time picker (113:6038). Nothing at or before now, or at or before
 * `min`, can be picked; there is no upper limit.
 */
export function DateTimeField({ id, label, value, min, onChange, disabled, readOnly, invalid, describedBy }: Props) {
  const { t, locale } = useT('common')
  const [open, setOpen] = useState(false)
  const dateText = (date: string) => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' }).format(local(date))
  const shown = value.date && value.time ? `${dateText(value.date)} ${value.time}` : ''

  return <>
    <button
      type="button"
      id={id}
      className={'date-time-field' + (invalid ? ' date-time-field--invalid' : '') + (readOnly ? ' date-time-field--readonly' : '')}
      aria-label={t('dateTime.field', { label, value: shown || t('dateTime.empty') })}
      aria-invalid={invalid ? true : undefined}
      aria-describedby={describedBy}
      aria-readonly={readOnly ? true : undefined}
      aria-haspopup="dialog"
      disabled={disabled}
      onClick={() => { if (!readOnly) setOpen(true) }}
    >
      <span className={'date-time-field__date' + (value.date ? '' : ' date-time-field__placeholder')}>{value.date ? dateText(value.date) : t('dateTime.empty')}</span>
      <span className="date-time-field__divider" aria-hidden="true" />
      <span className={'date-time-field__time' + (value.time ? '' : ' date-time-field__placeholder')}>{value.time || '--:--'}</span>
    </button>
    {open && <Picker label={label} value={value} min={min} dateText={dateText} onClose={() => setOpen(false)} onConfirm={next => { setOpen(false); onChange(next) }} />}
  </>
}

function Picker({ label, value, min, dateText, onClose, onConfirm }: {
  label: string; value: DateTime; min?: DateTime; dateText(date: string): string; onClose(): void; onConfirm(value: DateTime): void
}) {
  const { t, locale } = useT('common')
  const [floor, setFloor] = useState(() => floorOf(min))
  const [step, setStep] = useState<'date' | 'time'>('date')
  const [focusDay, setFocusDay] = useState(() => {
    if (value.date && selectable(value.date, floor)) return value.date
    return selectable(floor.date, floor) ? floor.date : shift(floor.date, 1)
  })
  const [month, setMonth] = useState(() => focusDay.slice(0, 7))
  const [picked, setPicked] = useState(value.date)
  const [hour, setHour] = useState(0)
  const [minute, setMinute] = useState(0)
  const [passed, setPassed] = useState(false)
  const grid = useRef<HTMLTableElement>(null)
  const hourList = useRef<HTMLUListElement>(null)
  const minuteList = useRef<HTMLUListElement>(null)
  const firstDay = selectable(floor.date, floor) ? floor.date : shift(floor.date, 1)
  const ids = useId()
  const keyed = useRef(false)

  // 換步驟時把焦點放到新畫面上（第一次開啟由 Dialog 的 data-autofocus 處理）
  const stepped = useRef(false)
  useEffect(() => {
    if (!stepped.current) { stepped.current = true; return }
    if (step === 'time') hourList.current?.focus()
    else grid.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus()
  }, [step])

  // 方向鍵移動後（可能換了月份）把焦點放到新的那一天
  useEffect(() => {
    if (!keyed.current) return
    keyed.current = false
    grid.current?.querySelector<HTMLElement>(`[data-date="${focusDay}"]`)?.focus()
  }, [focusDay, month])

  useEffect(() => {
    for (const list of [hourList.current, minuteList.current]) {
      const chosen = list?.querySelector<HTMLElement>('[aria-selected="true"]')
      if (list && chosen) list.scrollTop = chosen.offsetTop - (list.clientHeight - chosen.offsetHeight) / 2
    }
  }, [step, hour, minute])

  function settle(date: string, h: number, m: number, bound: DateTime) {
    const hours = hoursOn(date, bound)
    const nextHour = hours.includes(h) ? h : hours[0]
    const minutes = minutesAt(date, nextHour, bound)
    setHour(nextHour)
    setMinute(minutes.includes(m) ? m : minutes[0])
  }

  function pick(date: string) {
    setPicked(date)
    setFocusDay(date)
    setPassed(false)
    const [h, m] = (date === value.date && value.time ? value.time : date === floor.date ? '00:00' : '09:00').split(':').map(Number)
    settle(date, h, m, floor)
    setStep('time')
  }

  function onGridKey(event: KeyboardEvent) {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (event.key in moves) {
      event.preventDefault()
      // 走到過去的日子就停在最早能選的那天
      const target = [shift(focusDay, moves[event.key]), firstDay].sort()[1]
      keyed.current = true
      setFocusDay(target)
      setMonth(target.slice(0, 7))
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      pick(focusDay)
    }
  }

  function confirm() {
    // 選擇器開著的時候「現在」一直往前走：確認前再算一次
    const bound = floorOf(min)
    setFloor(bound)
    const time = `${pad(hour)}:${pad(minute)}`
    if (`${picked} ${time}` > `${bound.date} ${bound.time}`) return onConfirm({ date: picked, time })
    setPassed(true)
    if (selectable(picked, bound)) settle(picked, hour, minute, bound)
    else {
      // 選的日子已經整天過了（例如跨過午夜）：回到現在最早能選的那一天
      const first = selectable(bound.date, bound) ? bound.date : shift(bound.date, 1)
      setFocusDay(first)
      setMonth(first.slice(0, 7))
      setStep('date')
    }
  }

  const [year, monthIndex] = month.split('-').map(Number)
  const start = new Date(year, monthIndex - 1, 1)
  const lead = start.getDay()
  const days = new Date(year, monthIndex, 0).getDate()
  const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => new Date(year, monthIndex - 1, 1 - lead + i))
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7))
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'narrow' })
  const today = floorOf().date
  const previous = monthKey(year, monthIndex - 2)
  const next = monthKey(year, monthIndex)

  // 只有一天能用 Tab 進入：焦點日在這個月就是它，否則是這個月第一個能選的日子
  const roving = focusDay.slice(0, 7) === month ? focusDay : firstEnabled(month, floor)
  const hours = picked ? hoursOn(picked, floor) : []
  const minutes = picked ? minutesAt(picked, hour, floor) : []
  const column = (kind: 'hour' | 'minute', list: number[], selected: number, choose: (n: number) => void, ref: typeof hourList) => {
    const index = list.indexOf(selected)
    const nudge = (delta: number) => { const n = list[index + delta]; if (n !== undefined) choose(n) }
    return <div className="time-column">
      <span className="time-column__label" aria-hidden="true">{t(`dateTime.${kind}`)}</span>
      <button type="button" className="time-column__arrow" aria-label={t(`dateTime.${kind}Up`)} disabled={index <= 0} onClick={() => nudge(-1)}>⌃</button>
      <ul
        ref={ref}
        role="listbox"
        aria-label={t(`dateTime.${kind}`)}
        tabIndex={0}
        className="time-column__list"
        aria-activedescendant={`${ids}${kind}-${selected}`}
        onKeyDown={event => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); nudge(event.key === 'ArrowUp' ? -1 : 1) }
        }}
      >
        {list.map(n => <li key={n} id={`${ids}${kind}-${n}`} role="option" aria-selected={n === selected} className="time-column__option" onClick={() => choose(n)}>{pad(n)}</li>)}
      </ul>
      <button type="button" className="time-column__arrow" aria-label={t(`dateTime.${kind}Down`)} disabled={index >= list.length - 1} onClick={() => nudge(1)}>⌄</button>
    </div>
  }

  return <Dialog
    title={step === 'date' ? t('dateTime.chooseDate') : t('dateTime.chooseTime')}
    onClose={onClose}
    footer={step === 'time' ? <>
      <button type="button" className="button button--outline" onClick={onClose}>{t('dateTime.cancel')}</button>
      <button type="button" className="button button--primary" onClick={confirm}>{t('dateTime.confirm')}</button>
    </> : undefined}
  >
    <div className="date-time-picker">
      {passed && <p role="alert" className="form-error">{t('dateTime.passed')}</p>}
      {step === 'date' ? <>
        <div className="calendar__head">
          <button type="button" className="calendar__nav" aria-label={t('dateTime.previousMonth')} disabled={previous < floor.date.slice(0, 7)} onClick={() => setMonth(previous)}>←</button>
          <h3 className="calendar__month" aria-live="polite">{new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(start)}</h3>
          <button type="button" className="calendar__nav" aria-label={t('dateTime.nextMonth')} onClick={() => setMonth(next)}>→</button>
        </div>
        <table ref={grid} className="calendar" role="grid" onKeyDown={onGridKey}>
          <thead><tr>{weeks[0].map(d => <th key={d.getDay()} scope="col">{weekday.format(d)}</th>)}</tr></thead>
          <tbody>{weeks.map(week => <tr key={week[0].getTime()}>{week.map(d => {
            const date = isoDate(d.getFullYear(), d.getMonth(), d.getDate())
            if (d.getMonth() !== monthIndex - 1) return <td key={date}><span className="calendar__day calendar__day--outside" aria-hidden="true">{d.getDate()}</span></td>
            const enabled = selectable(date, floor)
            return <td key={date}><button
              type="button"
              data-date={date}
              data-autofocus={date === focusDay ? true : undefined}
              tabIndex={date === roving ? 0 : -1}
              aria-label={dateText(date)}
              aria-pressed={date === picked}
              aria-current={date === today ? 'date' : undefined}
              disabled={!enabled}
              className={'calendar__day' + (date === today ? ' calendar__day--today' : '') + (date === picked ? ' calendar__day--picked' : '')}
              onFocus={() => setFocusDay(date)}
              onClick={() => pick(date)}
            >{d.getDate()}</button></td>
          })}</tr>)}</tbody>
        </table>
      </> : <>
        <button type="button" className="date-time-picker__back" aria-label={t('dateTime.backToDate')} onClick={() => { setPassed(false); setStep('date') }}>← <span aria-hidden="true">{dateText(picked)}</span></button>
        <div className="time-summary">
          <div><span>{label}</span><small>{t('dateTime.clock')}</small></div>
          <strong>{`${pad(hour)}:${pad(minute)}`}</strong>
        </div>
        <div className="time-columns">
          {column('hour', hours, hour, h => settle(picked, h, minute, floor), hourList)}
          <span className="time-columns__colon" aria-hidden="true">:</span>
          {column('minute', minutes, minute, setMinute, minuteList)}
        </div>
      </>}
    </div>
  </Dialog>
}

function firstEnabled(month: string, floor: DateTime): string {
  const [y, m] = month.split('-').map(Number)
  const days = new Date(y, m, 0).getDate()
  for (let d = 1; d <= days; d++) { const date = isoDate(y, m - 1, d); if (selectable(date, floor)) return date }
  return ''
}
