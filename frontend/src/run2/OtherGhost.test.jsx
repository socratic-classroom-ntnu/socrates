import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { DraftComposer } from '../shared/input/DraftComposer'

function Harness() {
  const [value, setValue] = useState('')
  const [accepted, setAccepted] = useState(false)
  return (
    <>
      <DraftComposer
        value={value}
        onChange={setValue}
        onSend={jest.fn()}
        ghostText="也許可以從選擇權與長期後果一起思考。"
        onGhostAccepted={() => setAccepted(true)}
      />
      <output>{accepted ? 'accepted' : 'suggesting'}</output>
    </>
  )
}

test('Tab adopts the gray AI idea into real text', () => {
  render(<Harness />)
  const box = screen.getByRole('textbox')
  expect(box).toHaveAttribute(
    'placeholder',
    '也許可以從選擇權與長期後果一起思考。',
  )
  fireEvent.keyDown(box, { key: 'Tab' })
  expect(box).toHaveValue('也許可以從選擇權與長期後果一起思考。')
  expect(screen.getByText('accepted')).toBeInTheDocument()
})

test('mobile acceptance control has the same effect', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: '採用 AI 奇思妙想' }))
  expect(screen.getByRole('textbox')).toHaveValue(
    '也許可以從選擇權與長期後果一起思考。',
  )
})
