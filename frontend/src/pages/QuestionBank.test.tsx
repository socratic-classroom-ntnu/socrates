import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QuestionBank } from './QuestionBank'
import { PublishQuestions } from '../features/question-bank/PublishQuestions'
import { ApiError, api } from '../api/classroomClient'

jest.mock('../api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../api/classroomClient')>('../api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn() }
})

const question = {
  id: 'q1', title: '共同資源怎麼分？', scenario: '社區菜園的收成要怎麼分配？',
  options: [{ id: 'a', text: '按出力分' }, { id: 'b', text: '平均分' }],
  duration_seconds: 90, argument_required: true, tutor_goal: '', probe_hints: [],
  max_focus_turns: 3, focus_response_seconds: 90, sender_point_cap: 5, receiver_point_cap: 25,
}
const item = { id: 'b1', title: '共同資源怎麼分？', tags: ['倫理'], scenario_excerpt: '社區菜園的收成要怎麼分配？', option_count: 2, author: 'fizzy', mine: false, published_at: 1, revision: 1 }
const scripts = [{ id: 's1', revision: 2, document: { title: '科技倫理', questions: [{}] } }, { id: 's2', revision: 1, document: { title: '公民討論', questions: [{}] } }]

function respond(overrides: Record<string, unknown> = {}) {
  jest.mocked(api).mockImplementation(async (path: string, method = 'GET') => {
    if (path in overrides) {
      const value = overrides[path]
      if (value instanceof Error) throw value
      return value
    }
    if (path === '/scripts') return scripts
    if (path.startsWith('/bank/questions?')) return { items: [item], total: 1, offset: 0, limit: 12 }
    if (path === '/bank/questions/b1') return { ...item, question }
    if (path === '/bank/questions/b1/import' && method === 'POST') return { id: 's2', revision: 2, question_id: 'bank-x', document: { questions: [{}, {}] } }
    throw new Error('unexpected ' + path)
  })
}

beforeEach(() => {
  jest.mocked(api).mockReset()
  respond()
})

test('lists published questions with author, excerpt and option count', async () => {
  render(<QuestionBank />)
  expect(screen.getByRole('heading', { level: 1, name: '題庫商店' })).toBeInTheDocument()
  const card = (await screen.findByRole('heading', { name: '共同資源怎麼分？' })).closest('article') as HTMLElement
  expect(card).toHaveTextContent('fizzy 分享')
  expect(card).toHaveTextContent('社區菜園的收成要怎麼分配？')
  expect(card).toHaveTextContent('2 個選項')
  expect(card).toHaveTextContent('#倫理')
  expect(api).toHaveBeenCalledWith('/bank/questions?q=&offset=0&limit=12')
})

test('searching sends the query text and explains an empty result', async () => {
  render(<QuestionBank />)
  await screen.findByRole('heading', { name: '共同資源怎麼分？' })
  respond({ '/bank/questions?q=%E8%8F%9C%E5%9C%92+%E5%85%AC%E5%B9%B3&offset=0&limit=12': { items: [], total: 0, offset: 0, limit: 12 } })
  fireEvent.change(screen.getByRole('searchbox', { name: '搜尋題庫' }), { target: { value: ' 菜園 公平 ' } })
  fireEvent.click(screen.getByRole('button', { name: '搜尋' }))
  expect(await screen.findByRole('heading', { name: '找不到符合的題目' })).toBeInTheDocument()
})

test('preview shows the full question and imports it into the chosen script with an action id', async () => {
  render(<QuestionBank />)
  fireEvent.click(await screen.findByRole('button', { name: '預覽「共同資源怎麼分？」' }))
  const preview = await screen.findByRole('region', { name: '題目預覽' })
  expect(within(preview).getByText('按出力分')).toBeInTheDocument()
  expect(within(preview).queryByRole('button', { name: '從題庫下架' })).toBeNull()
  fireEvent.change(within(preview).getByRole('combobox', { name: '加入哪一份課程腳本' }), { target: { value: 's2' } })
  fireEvent.click(within(preview).getByRole('button', { name: '加入我的課程腳本' }))
  await waitFor(() => expect(api).toHaveBeenCalledWith('/bank/questions/b1/import', 'POST', { script_id: 's2', action_id: expect.any(String) }))
  expect(await screen.findByRole('status')).toHaveTextContent('已加入「公民討論」，現在共 2 題。')
})

test('a rejected import shows the Chinese text for the bank error code', async () => {
  respond({ '/bank/questions/b1/import': new ApiError(422, 'BANK_SCRIPT_QUESTION_LIMIT') })
  render(<QuestionBank />)
  fireEvent.click(await screen.findByRole('button', { name: '預覽「共同資源怎麼分？」' }))
  fireEvent.click(await screen.findByRole('button', { name: '加入我的課程腳本' }))
  expect(await screen.findByRole('status')).toHaveTextContent('這份劇本的題目已達上限')
})

test('the publisher can unpublish from the preview', async () => {
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true)
  respond({ '/bank/questions/b1': { ...item, mine: true, question }, '/bank/questions/b1/unpublish': { id: 'b1', status: 'UNPUBLISHED' } })
  render(<QuestionBank />)
  fireEvent.click(await screen.findByRole('button', { name: '預覽「共同資源怎麼分？」' }))
  fireEvent.click(await screen.findByRole('button', { name: '從題庫下架' }))
  await waitFor(() => expect(api).toHaveBeenCalledWith('/bank/questions/b1/unpublish', 'POST', { action_id: expect.any(String) }))
  expect(await screen.findByText('已從題庫商店下架。')).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: '題目預覽' })).toBeNull()
  confirm.mockRestore()
})

test('each script question can be published to the bank', async () => {
  jest.mocked(api).mockResolvedValue({ id: 'b9' })
  const onNote = jest.fn()
  render(<PublishQuestions script={{ id: 's1', revision: 1, document: { questions: [question] } }} onNote={onNote} />)
  fireEvent.click(screen.getByRole('button', { name: '發布「共同資源怎麼分？」到題庫' }))
  await waitFor(() => expect(onNote).toHaveBeenCalledWith('「共同資源怎麼分？」已發布到題庫商店。'))
  expect(api).toHaveBeenCalledWith('/bank/questions', 'POST', { script_id: 's1', question_id: 'q1', action_id: expect.any(String) })
})
