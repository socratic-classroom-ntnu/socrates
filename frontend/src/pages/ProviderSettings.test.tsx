import { fireEvent, render, screen } from '@testing-library/react'
import { FREE_ROUTER, ModelMatrix, ModelSelect } from './ProviderSettings'

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
  fireEvent.change(screen.getByRole('combobox', { name: '套用至全部 AI' }), { target: { value: '__other__' } })
  fireEvent.change(screen.getByLabelText('套用至全部 AI（自行輸入）'), {
    target: { value: 'provider/model-x' },
  })
  fireEvent.click(screen.getByRole('button', { name: '套用此模型到全部 AI' }))
  const matrix = onChange.mock.calls.at(-1)[0]
  expect(Object.keys(matrix)).toHaveLength(8)
  expect(new Set(Object.values(matrix))).toEqual(new Set(['provider/model-x']))
})

test('the Free Router is the default pick for every AI at once', () => {
  const onChange = jest.fn()
  render(<ModelMatrix value={{}} onChange={onChange} profiles={[]} />)
  expect(screen.getByRole('combobox', { name: '套用至全部 AI' })).toHaveValue(FREE_ROUTER)
  fireEvent.click(screen.getByRole('button', { name: '套用此模型到全部 AI' }))
  expect(new Set(Object.values(onChange.mock.calls.at(-1)[0]))).toEqual(new Set([FREE_ROUTER]))
})

test('model menu lists known models and keeps 其他 last; 其他 opens a text box', () => {
  let value = ''
  const onChange = jest.fn(next => { value = next })
  const { rerender } = render(
    <ModelSelect label="蘇格拉底導師" value={value} onChange={onChange} emptyLabel="沿連線的預設模型"
      choices={[{ value: FREE_ROUTER, label: 'Free Router' }, { value: 'openai/gpt-x', label: 'openai/gpt-x' }]} />,
  )
  const select = screen.getByRole('combobox', { name: '蘇格拉底導師' })
  const options = Array.from(select.querySelectorAll('option')).map(option => option.textContent)
  expect(options).toEqual(['沿連線的預設模型', 'Free Router', 'openai/gpt-x', '其他（自行輸入）'])
  expect(screen.queryByLabelText('蘇格拉底導師（自行輸入）')).toBeNull()
  fireEvent.change(select, { target: { value: 'openai/gpt-x' } })
  expect(onChange).toHaveBeenLastCalledWith('openai/gpt-x')
  fireEvent.change(select, { target: { value: '__other__' } })
  expect(onChange).toHaveBeenLastCalledWith('')
  rerender(<ModelSelect label="蘇格拉底導師" value={value} onChange={onChange} emptyLabel="沿連線的預設模型"
    choices={[{ value: FREE_ROUTER, label: 'Free Router' }]} />)
  fireEvent.change(screen.getByLabelText('蘇格拉底導師（自行輸入）'), { target: { value: 'my/model' } })
  expect(onChange).toHaveBeenLastCalledWith('my/model')
})

test('a saved model outside the list shows as 其他 with its text', () => {
  render(<ModelSelect label="AI 學生" value="vendor/custom-1" onChange={jest.fn()} choices={[{ value: FREE_ROUTER, label: 'Free Router' }]} />)
  expect(screen.getByRole('combobox', { name: 'AI 學生' })).toHaveValue('__other__')
  expect(screen.getByLabelText('AI 學生（自行輸入）')).toHaveValue('vendor/custom-1')
})
