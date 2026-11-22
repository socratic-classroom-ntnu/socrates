
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { RadioCards } from './RadioCards'

const OPTIONS = [
  { value: 'zh-Hant', label: '繁體中文' },
  { value: 'en', label: 'English', description: 'English language' },
  { value: 'es', label: 'Español', disabled: true },
] as const

function Harness({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState<string>('zh-Hant')

  return <>
    <RadioCards
      legend="語言設定"
      name="language"
      options={OPTIONS}
      value={value}
      onChange={setValue}
      disabled={disabled}
    />
    <output data-testid="selected">{value}</output>
  </>
}

test('renders an accessible radio group and options', () => {
  render(<Harness />)

  const group = screen.getByRole('group', { name: '語言設定' })
  expect(group).toBeInTheDocument()
  expect(screen.getAllByRole('radio')).toHaveLength(3)
  expect(screen.getByRole('radio', { name: '繁體中文' })).toBeChecked()
  expect(screen.getByText('English language')).toBeInTheDocument()
})

test('selecting a radio updates the controlled value', () => {
  render(<Harness />)

  fireEvent.click(screen.getByRole('radio', { name: /English/ }))

  expect(screen.getByRole('radio', { name: /English/ })).toBeChecked()
  expect(screen.getByTestId('selected')).toHaveTextContent('en')
})

test('an individual disabled option cannot be selected', () => {
  render(<Harness />)

  const option = screen.getByRole('radio', { name: 'Español' })

  expect(option).toBeDisabled()
  expect(option).not.toBeChecked()
  expect(screen.getByRole('radio', { name: '繁體中文' })).toBeChecked()
})

test('disabling the group disables all options', () => {
  render(<Harness disabled />)

  screen.getAllByRole('radio').forEach(option => {
    expect(option).toBeDisabled()
  })
})

test('radios share the same name', () => {
  render(<Harness />)

  screen.getAllByRole('radio').forEach(option => {
    expect(option).toHaveAttribute('name', 'language')
  })
})

test.each([
  [2, '2', '2'],
  [3, '3', '3'],
  [4, '4', '2'],
])('%i options set the desktop and mobile column counts', (count, desktop, mobile) => {
  const options = Array.from({ length: count }, (_, i) => ({ value: `v${i}`, label: `選項 ${i}` }))
  render(
    <RadioCards legend="欄數" name="columns" options={options} value="v0" onChange={() => {}} />,
  )

  const grid = screen.getAllByRole('radio')[0].closest('label')!.parentElement!
  expect(grid.style.getPropertyValue('--radio-cards-count')).toBe(desktop)
  expect(grid.style.getPropertyValue('--radio-cards-mobile-count')).toBe(mobile)
})
