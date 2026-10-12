import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { ScriptBuilder } from './ScriptBuilder'
import { ApiError, api } from '../../api/classroomClient'

jest.mock('../../api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../api/classroomClient')>('../../api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), exportYAML: jest.fn(), importYAML: jest.fn(), scriptAssist: jest.fn() }
})

const bankQuestion = {
  id: 'q1', title: '共同資源怎麼分？', scenario: '社區菜園的收成要怎麼分配？',
  options: [{ id: 'a', text: '按出力分' }, { id: 'b', text: '平均分' }],
  duration_seconds: 90, argument_required: true, tutor_goal: '釐清原則', probe_hints: ['為什麼？'],
  max_focus_turns: 3, focus_response_seconds: 90, sender_point_cap: 5, receiver_point_cap: 25,
  max_personal_turns: 6, personal_seconds: 600,
}
const item = { id: 'b1', title: '共同資源怎麼分？', tags: ['倫理'], scenario_excerpt: '社區菜園的收成要怎麼分配？', option_count: 2, author: 'fizzy', mine: false, published_at: 1, revision: 1 }
const sample = { ...bankQuestion, id: 'sample-trolley_basic', title: '失控的電車', scenario: '你是一輛電車的司機。', options: [{ id: 'a', text: '把電車轉向岔道' }, { id: 'b', text: '不轉向' }] }

function routes(overrides: Record<string, unknown> = {}) {
  jest.mocked(api).mockImplementation(async (path: string) => {
    if (path in overrides) {
      const value = overrides[path]
      if (value instanceof Error) throw value
      return value
    }
    if (path.startsWith('/bank/questions?')) return { items: [item], total: 1, offset: 0, limit: 12 }
    if (path === '/bank/questions/b1') return { ...item, question: bankQuestion }
    if (path === '/scripts/samples') return { title: '電車難題', questions: [sample] }
    throw new Error('unexpected ' + path)
  })
}

beforeEach(() => jest.mocked(api).mockReset())

test('nothing is fetched until the teacher opens a source', () => {
  routes()
  render(<ScriptBuilder initial={null} onSaved={jest.fn()} />)
  expect(screen.getByRole('button', { name: '從題庫加入' })).toHaveAttribute('aria-expanded', 'false')
  expect(api).not.toHaveBeenCalled()
})

test('a bank question lands in the unsaved draft, not in a saved script', async () => {
  routes()
  render(<ScriptBuilder initial={null} onSaved={jest.fn()} />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '從題庫加入' })) })
  expect(api).toHaveBeenCalledWith('/bank/questions?q=&offset=0&limit=12')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '預覽題庫題目「共同資源怎麼分？」' })) })
  const preview = screen.getByRole('region', { name: '題庫題目預覽' })
  expect(within(preview).getByText('按出力分')).toBeInTheDocument()
  fireEvent.click(within(preview).getByRole('button', { name: '加入草稿' }))
  expect(screen.getByText('⠿ 情境 2')).toBeInTheDocument()
  expect(screen.getAllByLabelText('標題')[1]).toHaveValue('共同資源怎麼分？')
  expect(screen.getByText('有尚未儲存的修改')).toBeInTheDocument()
  expect(screen.getAllByRole('status')[0]).toHaveTextContent('已從題庫加入「共同資源怎麼分？」到草稿最後')
  // 只讀取題庫，不呼叫匯入或儲存：要不要存由老師決定。
  expect(jest.mocked(api).mock.calls.every(([, method]) => method === undefined)).toBe(true)
})

test('a sample question can be added twice without an id clash', async () => {
  routes()
  render(<ScriptBuilder initial={null} onSaved={jest.fn()} />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '範例題目' })) })
  expect(screen.getByText('範例來源：電車難題。加入後可以再修改，記得儲存草稿。')).toBeInTheDocument()
  const add = screen.getByRole('button', { name: '加入範例「失控的電車」到草稿' })
  fireEvent.click(add)
  fireEvent.click(add)
  expect(screen.getByText('⠿ 情境 3')).toBeInTheDocument()
  const titles = screen.getAllByLabelText('標題').map(input => (input as HTMLInputElement).value)
  expect(titles.slice(1)).toEqual(['失控的電車', '失控的電車'])
})

test('an unavailable sample source reads as Chinese', async () => {
  routes({ '/scripts/samples': new ApiError(503, 'SCRIPT_SAMPLES_UNAVAILABLE') })
  render(<ScriptBuilder initial={null} onSaved={jest.fn()} />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '範例題目' })) })
  expect(screen.getAllByRole('status')[0]).toHaveTextContent('目前讀不到範例題目')
})
