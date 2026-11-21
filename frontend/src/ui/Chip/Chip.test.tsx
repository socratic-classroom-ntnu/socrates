import { render, screen } from '@testing-library/react'
import { Chip, ChipGroup } from '..'

test('Chip exposes aria-pressed inside a labelled group', () => {
  render(<ChipGroup label="篩選活動"><Chip pressed>全部 3</Chip><Chip pressed={false}>草稿 1</Chip></ChipGroup>)
  const group = screen.getByRole('group', { name: '篩選活動' })
  expect(group).toContainElement(screen.getByRole('button', { name: '全部 3', pressed: true }))
  expect(screen.getByRole('button', { name: '草稿 1', pressed: false })).toHaveAttribute('type', 'button')
})
