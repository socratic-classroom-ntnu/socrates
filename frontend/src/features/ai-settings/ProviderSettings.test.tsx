import { fireEvent, render, screen } from '@testing-library/react'
import { FREE_ROUTER, ModelMatrix, ModelSelect, mismatchedRoles } from './ProviderSettings'

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

const openrouter = { id: 'p-or', adapter: 'openrouter', default_model: FREE_ROUTER }
const openai = { id: 'p-oa', adapter: 'openai', default_model: 'gpt-4o-mini' }
const gemini = { id: 'p-gm', adapter: 'gemini', default_model: 'gemini-2.0-flash' }

const optionValues = (name: string) =>
  Array.from(screen.getByRole('combobox', { name }).querySelectorAll('option')).map(option => option.value)

test('an OpenRouter connection starts every AI on the Free Router', () => {
  const onChange = jest.fn()
  render(<ModelMatrix value={{}} onChange={onChange} profiles={[openrouter]} profile={openrouter} />)
  expect(screen.getByRole('combobox', { name: '套用至全部 AI' })).toHaveValue(FREE_ROUTER)
  fireEvent.click(screen.getByRole('button', { name: '套用此模型到全部 AI' }))
  expect(new Set(Object.values(onChange.mock.calls.at(-1)[0]))).toEqual(new Set([FREE_ROUTER]))
})

// 非 OpenRouter 的連線認不得 openrouter/free；一開始就選它，按下套用整個課堂的 AI 都會失敗
test('other services never start on, or offer, the Free Router', () => {
  const onChange = jest.fn()
  render(
    <ModelMatrix value={{}} onChange={onChange} profiles={[openrouter, openai]} profile={openai}
      models={['gpt-4.1', 'openrouter/auto']} />,
  )
  expect(optionValues('套用至全部 AI')).not.toContain(FREE_ROUTER)
  expect(optionValues('套用至全部 AI')).not.toContain('openrouter/auto')
  expect(optionValues('蘇格拉底導師')).not.toContain(FREE_ROUTER)
  // 有讀到模型就從第一個開始
  expect(screen.getByRole('combobox', { name: '套用至全部 AI' })).toHaveValue('gpt-4.1')
  fireEvent.click(screen.getByRole('button', { name: '套用此模型到全部 AI' }))
  expect(new Set(Object.values(onChange.mock.calls.at(-1)[0]))).toEqual(new Set(['gpt-4.1']))
})

test('without discovered models another service starts empty and cannot apply until a model is chosen', () => {
  const onChange = jest.fn()
  render(<ModelMatrix value={{}} onChange={onChange} profiles={[gemini]} profile={gemini} />)
  expect(screen.getByRole('combobox', { name: '套用至全部 AI' })).toHaveValue('')
  expect(screen.getByRole('button', { name: '套用此模型到全部 AI' })).toBeDisabled()
  fireEvent.change(screen.getByRole('combobox', { name: '套用至全部 AI' }), { target: { value: 'gemini-2.0-flash' } })
  fireEvent.click(screen.getByRole('button', { name: '套用此模型到全部 AI' }))
  expect(new Set(Object.values(onChange.mock.calls.at(-1)[0]))).toEqual(new Set(['gemini-2.0-flash']))
})

test('typing an OpenRouter model for another service is refused', () => {
  const onChange = jest.fn()
  render(<ModelMatrix value={{}} onChange={onChange} profiles={[openai]} profile={openai} />)
  fireEvent.change(screen.getByRole('combobox', { name: '套用至全部 AI' }), { target: { value: '__other__' } })
  fireEvent.change(screen.getByLabelText('套用至全部 AI（自行輸入）'), { target: { value: FREE_ROUTER } })
  expect(screen.getByRole('button', { name: '套用此模型到全部 AI' })).toBeDisabled()
  expect(screen.getByRole('alert')).toHaveTextContent('不是 OpenRouter')
  fireEvent.click(screen.getByRole('button', { name: '套用此模型到全部 AI' }))
  expect(onChange).not.toHaveBeenCalled()
})

test('switching the connection resets the pick to that connection\'s default', () => {
  const props = { value: {}, onChange: jest.fn(), profiles: [openrouter, gemini] }
  const { rerender } = render(<ModelMatrix {...props} profile={openrouter} />)
  expect(screen.getByRole('combobox', { name: '套用至全部 AI' })).toHaveValue(FREE_ROUTER)
  rerender(<ModelMatrix {...props} profile={gemini} />)
  expect(screen.getByRole('combobox', { name: '套用至全部 AI' })).toHaveValue('')
  expect(optionValues('套用至全部 AI')).not.toContain(FREE_ROUTER)
  rerender(<ModelMatrix {...props} profile={openrouter} />)
  expect(screen.getByRole('combobox', { name: '套用至全部 AI' })).toHaveValue(FREE_ROUTER)
})

test('roles still on an OpenRouter model are flagged for another service', () => {
  render(<ModelMatrix value={{ socratic_tutor: FREE_ROUTER, ai_student: 'gpt-4.1' }} onChange={jest.fn()} profiles={[openai]} profile={openai} />)
  expect(screen.getByRole('alert')).toHaveTextContent('蘇格拉底導師')
  expect(screen.getByRole('alert')).not.toHaveTextContent('AI 學生')
  expect(mismatchedRoles({ socratic_tutor: FREE_ROUTER }, openrouter)).toEqual([])
  expect(mismatchedRoles({ socratic_tutor: FREE_ROUTER }, null)).toEqual([])
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
