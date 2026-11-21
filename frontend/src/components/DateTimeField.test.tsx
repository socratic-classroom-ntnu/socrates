import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { DateTimeField, type DateTime } from './DateTimeField'

// 固定在台北 2026/10/9（五）14:20:30；「現在」以前的日期與時間都不能選
const original = process.env.TZ
beforeAll(() => { process.env.TZ = 'Asia/Taipei' })
afterAll(() => { process.env.TZ = original })
beforeEach(() => { jest.useFakeTimers({ now: new Date(2026, 9, 9, 14, 20, 30) }) })
afterEach(() => { jest.useRealTimers() })

function Harness({ initial = { date: '', time: '' }, min, onChange = () => {} }: { initial?: DateTime; min?: DateTime; onChange?(value: DateTime): void }) {
  const [value, setValue] = useState(initial)
  return <DateTimeField id="end" label="結束時間" value={value} min={min} onChange={next => { setValue(next); onChange(next) }} />
}

function openPicker() {
  fireEvent.click(screen.getByRole('button', { name: /^結束時間/ }))
  return screen.getByRole('dialog', { name: '選擇日期' })
}

const day = (name: string) => screen.getByRole('button', { name })
const options = (name: string) => within(screen.getByRole('listbox', { name })).getAllByRole('option').map(option => option.textContent)

test('past days are disabled', () => {
  render(<Harness />)
  openPicker()
  expect(day('2026年10月8日')).toBeDisabled()
  expect(day('2026年10月9日')).toBeEnabled()
  expect(day('2026年10月10日')).toBeEnabled()
  expect(screen.getByRole('button', { name: '上個月' })).toBeDisabled()
  // 沒有上限：一直往後翻都可以
  for (let i = 0; i < 24; i++) fireEvent.click(screen.getByRole('button', { name: '下個月' }))
  expect(day('2028年10月1日')).toBeEnabled()
})

test('today hides past hours and minutes', () => {
  render(<Harness />)
  openPicker()
  fireEvent.click(day('2026年10月9日'))
  expect(screen.getByRole('dialog', { name: '選擇時間' })).toBeInTheDocument()
  expect(options('時')).not.toContain('13')
  expect(options('時')[0]).toBe('14')
  expect(options('分')[0]).toBe('21')
  fireEvent.click(within(screen.getByRole('listbox', { name: '時' })).getByRole('option', { name: '15' }))
  expect(options('分')[0]).toBe('00')
  expect(options('分')).toHaveLength(60)
})

test('end cannot be before start', () => {
  render(<Harness min={{ date: '2026-10-20', time: '10:00' }} />)
  openPicker()
  // 開始在 10/20，日曆直接翻到那個月；10/19 以前都不能選
  expect(day('2026年10月19日')).toBeDisabled()
  fireEvent.click(day('2026年10月20日'))
  expect(options('時')[0]).toBe('10')
  expect(options('分')[0]).toBe('01')
})

test('confirm writes date and time', () => {
  const onChange = jest.fn()
  render(<Harness onChange={onChange} />)
  openPicker()
  fireEvent.click(day('2026年10月24日'))
  fireEvent.click(within(screen.getByRole('listbox', { name: '時' })).getByRole('option', { name: '23' }))
  fireEvent.click(within(screen.getByRole('listbox', { name: '分' })).getByRole('option', { name: '59' }))
  expect(screen.getByText('23:59')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '確認' }))
  expect(onChange).toHaveBeenCalledWith({ date: '2026-10-24', time: '23:59' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: /^結束時間/ })).toHaveTextContent('2026年10月24日23:59')
})

test('escape closes and returns focus', () => {
  const onChange = jest.fn()
  render(<Harness onChange={onChange} />)
  const field = screen.getByRole('button', { name: /^結束時間/ })
  field.focus()
  openPicker()
  expect(document.activeElement).toBe(day('2026年10月9日'))
  fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(field)
  expect(onChange).not.toHaveBeenCalled()
})

test('back arrow returns to the calendar', () => {
  render(<Harness />)
  openPicker()
  fireEvent.click(day('2026年10月24日'))
  fireEvent.click(screen.getByRole('button', { name: '回到日期' }))
  expect(screen.getByRole('dialog', { name: '選擇日期' })).toBeInTheDocument()
  expect(day('2026年10月24日')).toHaveAttribute('aria-pressed', 'true')
})

test('arrow keys move between days and Enter picks one', () => {
  render(<Harness />)
  openPicker()
  fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight' })
  expect(document.activeElement).toBe(day('2026年10月10日'))
  fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' })
  expect(document.activeElement).toBe(day('2026年10月17日'))
  // 往回走到過去的日子會停在今天
  fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowUp' })
  fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowLeft' })
  expect(document.activeElement).toBe(day('2026年10月9日'))
  fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Enter' })
  expect(screen.getByRole('dialog', { name: '選擇時間' })).toBeInTheDocument()
})

test('confirm checks the clock again', () => {
  const onChange = jest.fn()
  render(<Harness onChange={onChange} />)
  openPicker()
  fireEvent.click(day('2026年10月9日'))
  // 14:21 是開啟當下最早能選的時間；按確認前時鐘走到 14:21，它就過了
  jest.setSystemTime(new Date(2026, 9, 9, 14, 21, 5))
  fireEvent.click(screen.getByRole('button', { name: '確認' }))
  expect(onChange).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent('這個時間剛剛過了，請重新選擇')
  expect(options('分')[0]).toBe('22')
})

test('crossing midnight while open moves to the new today, not the day after', () => {
  jest.setSystemTime(new Date(2026, 9, 9, 23, 58, 30))
  const onChange = jest.fn()
  render(<Harness onChange={onChange} />)
  openPicker()
  fireEvent.click(day('2026年10月9日'))
  jest.setSystemTime(new Date(2026, 9, 10, 0, 0, 10))
  fireEvent.click(screen.getByRole('button', { name: '確認' }))
  expect(onChange).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog', { name: '選擇日期' })).toBeInTheDocument()
  expect(document.activeElement).toBe(day('2026年10月10日'))
})
