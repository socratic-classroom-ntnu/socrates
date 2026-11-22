import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RadioCards } from '..'

const options = [
  { value: 'all', label: '全部', description: '所有帳號都收得到。' },
  { value: 'teacher', label: '老師', disabled: true },
  { value: 'student', label: '學生' },
] as const

function Example({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState<'all' | 'teacher' | 'student'>('all')
  return <form aria-label="公告">
    <RadioCards legend="對象" name="audience" options={options} value={value} onChange={setValue} disabled={disabled} />
    <button type="submit">發布</button>
  </form>
}

test('provides a named group with a selected radio and an accessible description', () => {
  render(<Example />)
  const group = screen.getByRole('group', { name: '對象' })
  const all = within(group).getByRole('radio', { name: '全部' })
  expect(all).toBeChecked()
  expect(all).toHaveAccessibleDescription('所有帳號都收得到。')
  expect(within(group).getByRole('radio', { name: '老師' })).toBeDisabled()
})

test('uses one native radio group and updates selection and the submitted form value', async () => {
  const user = userEvent.setup()
  render(<Example />)
  const all = screen.getByRole('radio', { name: '全部' })
  const student = screen.getByRole('radio', { name: '學生' })
  await user.tab()
  expect(all).toHaveFocus()
  await user.keyboard('{ArrowRight}')
  expect(student).toHaveFocus()
  expect(student).toBeChecked()
  await user.tab()
  expect(screen.getByRole('button', { name: '發布' })).toHaveFocus()
  expect(new FormData(screen.getByRole<HTMLFormElement>('form', { name: '公告' })).get('audience')).toBe('student')
  await user.click(screen.getByText('全部'))
  expect(all).toBeChecked()
  expect(student).not.toBeChecked()
})

test('disables the entire group while a form is submitting', async () => {
  const user = userEvent.setup()
  render(<Example disabled />)
  expect(screen.getAllByRole('radio').every(radio => radio.matches(':disabled'))).toBe(true)
  await user.click(screen.getByText('學生'))
  expect(screen.getByRole('radio', { name: '全部' })).toBeChecked()
})

test('all radio options share the same name', () => {
  render(<Example />)

  const radios = screen.getAllByRole('radio')

  expect(radios).toHaveLength(3)

  radios.forEach(radio => {
    expect(radio).toHaveAttribute('name', 'audience')
  })
})