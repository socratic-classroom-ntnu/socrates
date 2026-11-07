import { render, screen } from '@testing-library/react'
import { describedBy, Field, FieldError, FieldHint, RequiredMark } from '..'

test('Field wires the label to the control and marks the error state', () => {
  render(<Field id="course-name" label="課程名稱" invalid>
    <input id="course-name" />
    <FieldError id="course-name-error">必填</FieldError>
    <FieldHint id="course-name-hint">最多 40 字</FieldHint>
  </Field>)
  const input = screen.getByLabelText('課程名稱')
  expect(input).toHaveAttribute('id', 'course-name')
  expect(input.closest('div')!.className.split(' ')).toEqual(['field', 'invalid'])
  expect(screen.getByText('必填')).toHaveAttribute('id', 'course-name-error')
  expect(screen.getByText('最多 40 字')).toHaveAttribute('id', 'course-name-hint')
})

test('required Field shows the star but keeps the accessible name clean', () => {
  render(<Field id="title" label="標題" required requiredText="（必填）"><input id="title" /></Field>)
  expect(screen.getByRole('textbox', { name: '標題 （必填）' })).toBeInTheDocument()
  expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true')
})

test('RequiredMark can sit in a legend', () => {
  render(<fieldset><legend>結束時間<RequiredMark /></legend></fieldset>)
  expect(screen.getByRole('group', { name: '結束時間' })).toBeInTheDocument()
})

test('describedBy joins only the ids that are shown', () => {
  expect(describedBy('title-error', 'title-hint')).toBe('title-error title-hint')
  expect(describedBy(false, null, undefined, 'title-hint')).toBe('title-hint')
  expect(describedBy(false, '')).toBeUndefined()
})
