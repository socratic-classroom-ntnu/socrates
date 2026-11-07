import { act, fireEvent, render, screen } from '@testing-library/react'
import { PersonalPanel, PersonalProgress, lastTutorOf, type PersonalView } from './PersonalDialogue'

// 人像（WebGL＋語音）另有自己的測試；這裡只看後端動作與個人對話內容。
jest.mock('../avatar/TutorAvatar', () => ({ TutorAvatar: () => null }))

const question = { title: '情境一', scenario: '要不要拉下拉桿？' }
const summary = {
  current_position: '選擇拉',
  reason_summary: '救更多人',
  relevant_conditions: ['沒有其他選擇時'],
  unresolved_issue: '',
}

function personal(over: Partial<PersonalView> = {}): PersonalView {
  return {
    status: 'probing',
    generating: false,
    messages: [
      { role: 'student', text: '我選拉，因為救更多人' },
      { role: 'tutor', text: '你說的「更多」怎麼比較？' },
    ],
    completed_turns: 0,
    max_turns: 6,
    summary: null,
    summary_digest: null,
    baseline: null,
    notice: null,
    open: true,
    ...over,
  }
}

test('shows the original question and own dialogue; reply follows available_actions', async () => {
  const send = jest.fn().mockResolvedValue(true)
  render(<PersonalPanel question={question} personal={personal()} actions={['personal_message']} send={send} />)
  expect(screen.getByRole('heading', { name: '情境一' })).toBeInTheDocument()
  expect(screen.getByText('要不要拉下拉桿？')).toBeInTheDocument()
  expect(screen.getByText('你說的「更多」怎麼比較？')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('回覆導師'), { target: { value: '人數' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '送出' })) })
  expect(send).toHaveBeenCalledWith('personal_message', { text: '人數' })
  expect(screen.getByLabelText('回覆導師')).toHaveValue('')
  expect(screen.queryByRole('button', { name: '符合我的想法' })).not.toBeInTheDocument()
})

test('incoming tutor lines preserve an unsent reply, and a rejected send keeps it editable', async () => {
  const send = jest.fn().mockResolvedValue(false)
  const view = personal()
  const { rerender } = render(<PersonalPanel question={question} personal={view} actions={['personal_message']} send={send}/>)
  fireEvent.change(screen.getByLabelText('回覆導師'), { target: { value: '還沒想完的回答' } })
  const updated = { ...view, messages: [...view.messages, { role: 'tutor', text: '還有其他判準嗎？' }] }
  rerender(<PersonalPanel question={question} personal={updated} actions={['personal_message']} send={send}/>)
  expect(screen.getByText('還有其他判準嗎？')).toBeInTheDocument()
  expect(screen.getByLabelText('回覆導師')).toHaveValue('還沒想完的回答')
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '送出' })))
  expect(send).toHaveBeenCalledWith('personal_message', { text: '還沒想完的回答' })
  expect(screen.getByLabelText('回覆導師')).toHaveValue('還沒想完的回答')
  send.mockResolvedValue(true)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '送出' })))
  expect(screen.getByLabelText('回覆導師')).toHaveValue('')
})

test('no reply box while the backend does not allow personal_message', () => {
  render(<PersonalPanel question={question} personal={personal({ generating: true })} actions={[]} send={jest.fn()} />)
  expect(screen.getByRole('status')).toHaveTextContent('導師正在思考')
  expect(screen.queryByLabelText('回覆導師')).not.toBeInTheDocument()
  expect(screen.queryAllByRole('button')).toHaveLength(0)
})

test('confirm card shows stance, reason, conditions and three backend-gated choices', async () => {
  const send = jest.fn().mockResolvedValue(true)
  const view = personal({ status: 'awaiting_confirm', summary, summary_digest: 'd1', completed_turns: 1 })
  render(<PersonalPanel question={question} personal={view} actions={['personal_confirm', 'personal_revise', 'personal_unclear']} send={send} />)
  const card = screen.getByRole('group', { name: '確認你的立場摘要' })
  expect(card).toHaveTextContent('選擇拉')
  expect(card).toHaveTextContent('救更多人')
  expect(card).toHaveTextContent('沒有其他選擇時')
  fireEvent.click(screen.getByRole('button', { name: '符合我的想法' }))
  expect(send).toHaveBeenCalledWith('personal_confirm', { summary_digest: 'd1' })
  fireEvent.click(screen.getByRole('button', { name: '暫時無法釐清' }))
  expect(send).toHaveBeenCalledWith('personal_unclear')
  fireEvent.click(screen.getByRole('button', { name: '我要修正' }))
  fireEvent.change(screen.getByLabelText('哪裡不符合？請寫下你的修正'), { target: { value: '我更在意公平' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '送出修正' })) })
  expect(send).toHaveBeenCalledWith('personal_revise', { text: '我更在意公平' })
})

test('only the choices the backend lists are rendered', () => {
  const view = personal({ status: 'awaiting_confirm', summary, summary_digest: 'd1' })
  render(<PersonalPanel question={question} personal={view} actions={['personal_confirm']} send={jest.fn()} />)
  expect(screen.getByRole('button', { name: '符合我的想法' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '我要修正' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '暫時無法釐清' })).not.toBeInTheDocument()
})

test('unavailable keeps the message and offers retry only when allowed', () => {
  const send = jest.fn().mockResolvedValue(true)
  const view = personal({ status: 'unavailable', notice: '導師暫停回應：LLM 暫時無法連線。你的訊息已保存，可稍後按「重試」。' })
  const { rerender } = render(<PersonalPanel question={question} personal={view} actions={['personal_retry']} send={send} />)
  expect(screen.getByText(/你的訊息已保存/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '重試' }))
  expect(send).toHaveBeenCalledWith('personal_retry')
  rerender(<PersonalPanel question={question} personal={view} actions={[]} send={send} />)
  expect(screen.queryByRole('button', { name: '重試' })).not.toBeInTheDocument()
})

test.each([
  ['capped', '尚未釐清'],
  ['unclear', '暫時無法釐清'],
  ['incomplete', '本題尚未完成'],
])('%s shows its outcome text', (status, text) => {
  render(<PersonalPanel question={question} personal={personal({ status, summary })} actions={[]} send={jest.fn()} />)
  expect(screen.getAllByText(new RegExp(text)).length).toBeGreaterThan(0)
})

test('teacher progress shows counts and summaries, retry only from row actions', () => {
  const send = jest.fn().mockResolvedValue(true)
  render(<PersonalProgress
    progress={{ probing: 1, awaiting_confirm: 0, confirmed: 2, unclear: 0, capped: 1, incomplete: 0, unavailable: 1, not_answered: 1 }}
    overview={[
      { member_id: 'm1', alias: '小明', status: 'confirmed', generating: false, completed_turns: 2, summary, baseline: { position: '選擇拉', reason_summary: '救更多人' }, actions: [] },
      { member_id: 'm2', alias: '小華', status: 'unavailable', generating: false, completed_turns: 0, summary: null, baseline: null, actions: ['personal_retry'] },
    ]}
    send={send} />)
  expect(screen.getByText(/對話中 1 · 已確認基準 2 · 尚未釐清 1 · 導師暫停 1 · 未作答 1/)).toBeInTheDocument()
  expect(screen.getByText('基準：選擇拉；救更多人')).toBeInTheDocument()
  const retry = screen.getAllByRole('button', { name: '重試導師' })
  expect(retry).toHaveLength(1)
  fireEvent.click(retry[0])
  expect(send).toHaveBeenCalledWith('personal_retry', { member_id: 'm2' })
})

test('the avatar is handed the latest tutor line, keyed by its position', () => {
  expect(lastTutorOf([{ role: 'tutor', text: '一' }, { role: 'student', text: '二' }, { role: 'tutor', text: '三' }, { role: 'student', text: '四' }]))
    .toEqual({ id: '2', text: '三' })
  expect(lastTutorOf([{ role: 'student', text: '只有學生' }])).toBeNull()
})
