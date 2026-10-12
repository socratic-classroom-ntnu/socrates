import { fireEvent, render, screen } from '@testing-library/react'
import { ModelMatrix } from './ProviderSettings'

test('apply one model to every AI role', () => {
  let current = {}
  const onChange = jest.fn(value => {
    current = value
  })
  render(
    <ModelMatrix
      value={current}
      onChange={onChange}
      profiles={[{ default_model: 'openrouter/free' }]}
    />,
  )
  fireEvent.change(screen.getByLabelText('套用至全部 AI'), {
    target: { value: 'provider/model-x' },
  })
  fireEvent.click(screen.getByRole('button', { name: '套用此模型到全部 AI' }))
  const matrix = onChange.mock.calls.at(-1)[0]
  expect(Object.keys(matrix)).toHaveLength(8)
  expect(new Set(Object.values(matrix))).toEqual(new Set(['provider/model-x']))
})
