import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { applyLocale } from '../../i18n'
import { Select, type SelectOption } from '..'
import { SEARCH_SPIN_MS } from './Select'

beforeEach(async () => { await applyLocale('zh-Hant') })

const FRUITS: SelectOption[] = [
  { value: 'apple', label: 'Apple', description: 'red' },
  { value: 'pear', label: 'Pear', description: 'green' },
  { value: 'plum', label: 'Plum', description: 'purple', badge: <span>sale</span> },
]

function Harness(props: Partial<Parameters<typeof Select>[0]> & { initial?: string }) {
  const [value, setValue] = useState(props.initial ?? 'apple')
  return <>
    <label htmlFor="fruit">Fruit</label>
    <Select id="fruit" value={value} options={FRUITS} listLabel="Fruit" onChange={setValue} {...props} />
    <output>{value}</output>
  </>
}

const trigger = () => screen.getByLabelText('Fruit', { selector: 'button' })

test('the button shows the chosen label and opens a list with it checked', () => {
  render(<Harness />)
  expect(trigger()).toHaveTextContent('Apple')
  expect(trigger()).toHaveAttribute('aria-haspopup', 'listbox')
  fireEvent.click(trigger())
  expect(trigger()).toHaveAttribute('aria-expanded', 'true')
  const options = within(screen.getByRole('listbox', { name: 'Fruit' })).getAllByRole('option')
  expect(options).toHaveLength(3)
  expect(options[0]).toHaveAttribute('aria-selected', 'true')
  expect(options[0]).toHaveTextContent('red')
  expect(options[2]).toHaveTextContent('sale')
})

test('clicking an option chooses it and closes the list', () => {
  render(<Harness />)
  fireEvent.click(trigger())
  fireEvent.click(screen.getByRole('option', { name: /Pear/ }))
  expect(screen.getByText('pear', { selector: 'output' })).toBeInTheDocument()
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(trigger()).toHaveFocus()
})

test('the keyboard opens, moves, picks and closes', () => {
  render(<Harness />)
  fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
  const list = screen.getByRole('listbox')
  fireEvent.keyDown(list, { key: 'ArrowDown' })
  fireEvent.keyDown(list, { key: 'ArrowDown' })
  fireEvent.keyDown(list, { key: 'ArrowDown' }) // stays on the last one
  fireEvent.keyDown(list, { key: 'Enter' })
  expect(screen.getByText('plum', { selector: 'output' })).toBeInTheDocument()
  fireEvent.keyDown(trigger(), { key: 'Enter' })
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(trigger()).toHaveFocus()
})

test('a click outside closes the list', () => {
  render(<><Harness /><p>elsewhere</p></>)
  fireEvent.click(trigger())
  fireEvent.mouseDown(screen.getByText('elsewhere'))
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})

test('a search box narrows by label, value or description', () => {
  render(<Harness search={{ label: 'Search fruit', placeholder: 'Search fruit…' }} />)
  fireEvent.click(trigger())
  const search = screen.getByRole('combobox', { name: 'Search fruit' })
  expect(search).toHaveFocus()
  fireEvent.change(search, { target: { value: 'GREEN' } })
  expect(within(screen.getByRole('listbox')).getAllByRole('option').map(o => o.textContent)).toEqual(['Peargreen'])
  fireEvent.keyDown(search, { key: 'ArrowDown' })
  fireEvent.keyDown(search, { key: 'Enter' })
  expect(screen.getByText('pear', { selector: 'output' })).toBeInTheDocument()
})

test('typed text can be used when allowed', () => {
  render(<Harness search={{ label: 'Search fruit', placeholder: '' }} typedLabel={text => `Use “${text}”`} />)
  fireEvent.click(trigger())
  fireEvent.change(screen.getByRole('combobox', { name: 'Search fruit' }), { target: { value: 'kiwi' } })
  fireEvent.click(screen.getByRole('option', { name: 'Use “kiwi”' }))
  expect(screen.getByText('kiwi', { selector: 'output' })).toBeInTheDocument()
  expect(trigger()).toHaveTextContent('kiwi')
})

test('a value not in the list shows as itself, an empty one shows the placeholder', () => {
  const { rerender } = render(<Harness initial="mango" />)
  expect(trigger()).toHaveTextContent('mango')
  rerender(<Harness initial="" placeholder="Choose a fruit" key="empty" />)
  expect(trigger()).toHaveTextContent('Choose a fruit')
})

test('disabled and invalid states reach the button', () => {
  render(<Harness disabled invalid describedBy="why" />)
  expect(trigger()).toBeDisabled()
  expect(trigger()).toHaveAttribute('aria-invalid', 'true')
  expect(trigger()).toHaveAttribute('aria-describedby', 'why')
})

test('a note line sits above the options', () => {
  render(<Harness note="3 fruits" />)
  fireEvent.click(trigger())
  expect(screen.getByText('3 fruits')).toBeInTheDocument()
})


test('a note can say how many options match what was typed', () => {
  render(<Harness search={{ label: 'Search fruit', placeholder: '' }} note={({ query, matches }) => (query ? `${matches} match` : 'all')} />)
  fireEvent.click(trigger())
  expect(screen.getByText('all')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox', { name: 'Search fruit' }), { target: { value: 'p' } })
  expect(screen.getByText('3 match')).toBeInTheDocument()
})


test('with a search box, Enter after typing keeps searching until an option is highlighted', () => {
  render(<Harness search={{ label: 'Search fruit', placeholder: '' }} />)
  fireEvent.click(trigger())
  const search = screen.getByRole('combobox', { name: 'Search fruit' })
  fireEvent.change(search, { target: { value: 'p' } })
  expect(search).not.toHaveAttribute('aria-activedescendant')
  fireEvent.keyDown(search, { key: 'Enter' })
  expect(screen.getByRole('listbox')).toBeInTheDocument()
  expect(screen.getByText('apple', { selector: 'output' })).toBeInTheDocument()
  fireEvent.keyDown(search, { key: 'ArrowDown' }) // apple, pear and plum all have a p
  fireEvent.keyDown(search, { key: 'ArrowDown' })
  fireEvent.keyDown(search, { key: 'Enter' })
  expect(screen.getByText('pear', { selector: 'output' })).toBeInTheDocument()
})

test('typing again clears the highlight', () => {
  render(<Harness search={{ label: 'Search fruit', placeholder: '' }} />)
  fireEvent.click(trigger())
  const search = screen.getByRole('combobox', { name: 'Search fruit' })
  fireEvent.keyDown(search, { key: 'ArrowDown' })
  expect(search).toHaveAttribute('aria-activedescendant')
  fireEvent.change(search, { target: { value: 'pl' } })
  expect(search).not.toHaveAttribute('aria-activedescendant')
  fireEvent.keyDown(search, { key: 'Enter' })
  expect(screen.getByText('apple', { selector: 'output' })).toBeInTheDocument()
})

test('Enter that confirms an input-method composition never picks', () => {
  render(<Harness search={{ label: 'Search fruit', placeholder: '' }} />)
  fireEvent.click(trigger())
  const search = screen.getByRole('combobox', { name: 'Search fruit' })
  fireEvent.keyDown(search, { key: 'ArrowDown' })
  fireEvent.keyDown(search, { key: 'Enter', isComposing: true })
  fireEvent.keyDown(search, { key: 'Enter', keyCode: 229 })
  expect(screen.getByRole('listbox')).toBeInTheDocument()
  expect(screen.getByText('apple', { selector: 'output' })).toBeInTheDocument()
})

test('Enter with nothing highlighted shows a short searching spin on the note line, then the result', () => {
  jest.useFakeTimers()
  try {
    render(<Harness search={{ label: 'Search fruit', placeholder: '' }} note={({ matches }) => `${matches} match`} />)
    fireEvent.click(trigger())
    const search = screen.getByRole('combobox', { name: 'Search fruit' })
    fireEvent.change(search, { target: { value: 'plu' } })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(screen.getByText('搜尋中…')).toBeInTheDocument()
    expect(screen.queryByText('1 match')).not.toBeInTheDocument()
    act(() => { jest.advanceTimersByTime(SEARCH_SPIN_MS) })
    expect(screen.queryByText('搜尋中…')).not.toBeInTheDocument()
    expect(screen.getByText('1 match')).toBeInTheDocument()
    expect(screen.getByText('apple', { selector: 'output' })).toBeInTheDocument()
    fireEvent.keyDown(search, { key: 'Enter' }) // every Enter spins again
    expect(screen.getByText('搜尋中…')).toBeInTheDocument()
  } finally {
    jest.useRealTimers()
  }
})

test('an input-method Enter does not spin either', () => {
  render(<Harness search={{ label: 'Search fruit', placeholder: '' }} note="all" />)
  fireEvent.click(trigger())
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search fruit' }), { key: 'Enter', isComposing: true })
  expect(screen.queryByText('搜尋中…')).not.toBeInTheDocument()
  expect(screen.getByText('all')).toBeInTheDocument()
})

test('the search box is never taken for a login field', () => {
  render(<Harness search={{ label: 'Search fruit', placeholder: '' }} />)
  fireEvent.click(trigger())
  const search = screen.getByRole('combobox', { name: 'Search fruit' })
  expect(search).toHaveAttribute('autocomplete', 'off')
  expect(search).toHaveAttribute('data-1p-ignore')
  expect(search).toHaveAttribute('data-lpignore', 'true')
  expect(search).toHaveAttribute('data-bwignore')
})
