import { act, fireEvent, render, screen } from '@testing-library/react'
import { applySuggestion, ScriptAssist } from './ScriptAssist'
import { newDocument } from './ScriptBuilder'
import { ApiError, scriptAssist } from '../../api/classroomClient'

jest.mock('../../api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../api/classroomClient')>('../../api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), scriptAssist: jest.fn() }
})

const suggested = {
  id: 'ai-1234567890',
  title: '救生艇的最後一個位置',
  scenario: '救生艇只剩一個位置。',
  options: [{ id: 'a', text: '抽籤' }, { id: 'b', text: '讓最年幼者上船' }],
  duration_seconds: 90,
  argument_required: true,
  tutor_goal: '辨認分配原則。',
  probe_hints: ['你最重視哪一個理由？'],
  max_focus_turns: 3,
  focus_response_seconds: 90,
  sender_point_cap: 5,
  receiver_point_cap: 25,
}

function documentWithOverride() {
  const doc = newDocument()
  doc.questions[0] = { ...doc.questions[0], id: 'q1', title: '原本的題目', scenario_ai: { provider_profile_id: 'p1', model: 'm1' } } as never
  return doc
}

beforeEach(() => jest.mocked(scriptAssist).mockReset())

test('asks the server with the request and draft, shows the suggestion, and adds it as a new question', async () => {
  let answer
  jest.mocked(scriptAssist).mockImplementation(() => new Promise(resolve => { answer = resolve }))
  const doc = documentWithOverride()
  const onApply = jest.fn()
  render(<ScriptAssist document={doc} scriptId="s-1" onApply={onApply} />)
  const ask = screen.getByRole('button', { name: '請 AI 提出建議' })
  expect(ask).toBeDisabled()
  fireEvent.change(screen.getByLabelText('想請 AI 怎麼協助？'), { target: { value: '稀缺資源分配' } })
  fireEvent.click(ask)
  const busy = screen.getByRole('button', { name: 'AI 構思中…' })
  expect(busy).toBeDisabled()
  expect(busy).toHaveAttribute('aria-busy', 'true')
  expect(scriptAssist).toHaveBeenCalledWith({ request: '稀缺資源分配', document: doc, question_index: null, script_id: 's-1' })

  await act(async () => { answer({ question: suggested, question_index: null, rationale: '凸顯取捨。', model: 'script-model' }) })
  const card = screen.getByRole('region', { name: 'AI 建議' })
  expect(card).toHaveTextContent('救生艇的最後一個位置')
  expect(card).toHaveTextContent('讓最年幼者上船')
  expect(card).toHaveTextContent('設計說明：凸顯取捨。')
  expect(card).toHaveTextContent('由 script-model 產生')
  expect(onApply).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: '加入為新題目' }))
  const applied = onApply.mock.calls[0][0]
  expect(applied.questions).toHaveLength(2)
  expect(applied.questions[0]).toBe(doc.questions[0])
  expect(applied.questions[1]).toMatchObject({ id: 'ai-1234567890', title: '救生艇的最後一個位置' })
  expect(screen.queryByRole('region', { name: 'AI 建議' })).toBeNull()
  expect(screen.getByText('已加入為新題目；確認內容後記得儲存草稿。')).toBeInTheDocument()
})

test('revising a question keeps its id and per-question model', async () => {
  jest.mocked(scriptAssist).mockResolvedValue({ question: { ...suggested, id: 'q1' }, question_index: 0, rationale: '' })
  const doc = documentWithOverride()
  const onApply = jest.fn()
  render(<ScriptAssist document={doc} onApply={onApply} />)
  fireEvent.change(screen.getByLabelText('想請 AI 怎麼協助？'), { target: { value: '更貼近高中生' } })
  fireEvent.change(screen.getByLabelText('要處理的題目'), { target: { value: '0' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '請 AI 提出建議' })) })
  expect(jest.mocked(scriptAssist).mock.calls[0][0]).toMatchObject({ question_index: 0, script_id: null })
  fireEvent.click(screen.getByRole('button', { name: '套用到情境 1' }))
  const [question] = onApply.mock.calls[0][0].questions
  expect(question).toMatchObject({ id: 'q1', title: '救生艇的最後一個位置', scenario_ai: { provider_profile_id: 'p1', model: 'm1' } })
})

test('a server error code reads as Chinese and nothing is applied', async () => {
  jest.mocked(scriptAssist).mockRejectedValue(new ApiError(409, 'SCRIPT_ASSIST_MODEL_REQUIRED'))
  const onApply = jest.fn()
  render(<ScriptAssist document={newDocument()} onApply={onApply} />)
  fireEvent.change(screen.getByLabelText('想請 AI 怎麼協助？'), { target: { value: '幫我出題' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '請 AI 提出建議' })) })
  expect(screen.getByRole('alert')).toHaveTextContent('還沒有指定「AI 劇本協作」要用的模型')
  expect(screen.getByRole('button', { name: '請 AI 提出建議' })).toBeEnabled()
  expect(onApply).not.toHaveBeenCalled()
})

test('a suggested id that already exists in the draft is replaced', () => {
  const doc = newDocument()
  const next = applySuggestion(doc, { question: { ...suggested, id: doc.questions[0].id }, question_index: null })
  expect(next.questions).toHaveLength(2)
  expect(next.questions[1].id).not.toBe(doc.questions[0].id)
})
