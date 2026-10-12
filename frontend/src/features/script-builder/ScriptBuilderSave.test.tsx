import { act, fireEvent, render, screen } from '@testing-library/react'
import { newDocument, ScriptBuilder } from './ScriptBuilder'
import { ApiError, api, importYAML } from '../../api/classroomClient'

jest.mock('../../api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../api/classroomClient')>('../../api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), exportYAML: jest.fn(), importYAML: jest.fn() }
})

beforeEach(() => {
  jest.mocked(api).mockReset()
  jest.mocked(importYAML).mockReset()
})

test('saving is busy until the server answers, so a double click sends one request', async () => {
  let answer
  jest.mocked(api).mockImplementation(() => new Promise(resolve => { answer = resolve }))
  const onSaved = jest.fn()
  render(<ScriptBuilder initial={null} onSaved={onSaved} />)
  const button = screen.getByRole('button', { name: '儲存草稿' })
  fireEvent.click(button)
  fireEvent.click(button)
  const busy = screen.getByRole('button', { name: '儲存中…' })
  expect(busy).toBeDisabled()
  expect(busy).toHaveAttribute('aria-busy', 'true')
  expect(api).toHaveBeenCalledTimes(1)
  await act(async () => { answer({ id: 's-1', revision: 1 }) })
  expect(screen.getByRole('button', { name: '儲存草稿' })).toBeEnabled()
  expect(screen.getByRole('status')).toHaveTextContent('草稿已儲存；開始教室時固定本次版本。')
  expect(onSaved).toHaveBeenCalledTimes(1)
})

test('fields that break the limits are listed and marked, and nothing is sent', () => {
  render(<ScriptBuilder initial={null} onSaved={jest.fn()} />)
  fireEvent.change(screen.getByLabelText('劇本名稱'), { target: { value: '' } })
  fireEvent.click(screen.getAllByRole('button', { name: '移除' })[0])
  fireEvent.click(screen.getAllByRole('button', { name: '移除' })[0])
  fireEvent.change(screen.getByLabelText('作答秒數'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: '儲存草稿' }))
  expect(api).not.toHaveBeenCalled()
  const alert = screen.getByRole('alert')
  expect(alert).toHaveTextContent('劇本名稱請填寫')
  expect(alert).toHaveTextContent('情境 1 的選項至少要 2 個')
  expect(alert).toHaveTextContent('情境 1 的作答秒數至少 1')
  expect(screen.getByLabelText('劇本名稱')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByLabelText('作答秒數')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByLabelText('選項 1')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByRole('status')).toHaveTextContent('有 3 個欄位要修改')
})

test('reviewed timing fields are editable and clear their own errors immediately', () => {
  const document = newDocument()
  document.preview_seconds = 0
  document.questions[0].focus_response_seconds = 0
  render(<ScriptBuilder initial={{ id: 's-1', revision: 1, document }} onSaved={jest.fn()} />)

  fireEvent.click(screen.getByRole('button', { name: '儲存草稿' }))
  expect(screen.getByRole('alert')).toHaveTextContent('預覽秒數至少 5')
  expect(screen.getByRole('alert')).toHaveTextContent('情境 1 的追問回應秒數至少 5')
  expect(screen.getByLabelText('預覽秒數')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByLabelText('追問回應秒數')).toHaveAttribute('aria-invalid', 'true')

  fireEvent.change(screen.getByLabelText('預覽秒數'), { target: { value: '8' } })
  expect(screen.getByLabelText('預覽秒數')).toHaveAttribute('aria-invalid', 'false')
  expect(screen.getByRole('alert')).not.toHaveTextContent('預覽秒數至少 5')
  expect(screen.getByRole('alert')).toHaveTextContent('情境 1 的追問回應秒數至少 5')

  fireEvent.change(screen.getByLabelText('追問回應秒數'), { target: { value: '90' } })
  expect(screen.getByLabelText('追問回應秒數')).toHaveAttribute('aria-invalid', 'false')
  expect(screen.queryByRole('alert')).toBeNull()
})

test('a 422 from the server shows the field it names', async () => {
  jest.mocked(api).mockRejectedValue(new ApiError(422, [
    { loc: ['body', 'document', 'questions', 0, 'title'], msg: 'String should have at most 300 characters', type: 'string_too_long', ctx: { max_length: 300 } },
  ]))
  render(<ScriptBuilder initial={null} onSaved={jest.fn()} />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '儲存草稿' })) })
  expect(screen.getByRole('alert')).toHaveTextContent('情境 1・標題：最多 300 字')
  expect(screen.getByLabelText('標題')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByRole('status')).toHaveTextContent('伺服器退回：有 1 個欄位要修改')
  expect(screen.getByRole('button', { name: '儲存草稿' })).toBeEnabled()
})

test('a 409 keeps the server wording, as before', async () => {
  jest.mocked(api).mockRejectedValue(new ApiError(409, '請讀取新版劇本後合併編輯。'))
  render(<ScriptBuilder initial={{ id: 's-1', revision: 2, document: undefined }} onSaved={jest.fn()} />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '儲存草稿' })) })
  expect(screen.getByRole('status')).toHaveTextContent('請讀取新版劇本後合併編輯。')
})

test('unsaved edits ask before the page unloads, and stop asking once saved', async () => {
  jest.mocked(api).mockResolvedValue({ id: 's-1', revision: 1 })
  render(<ScriptBuilder initial={null} onSaved={jest.fn()} />)
  const unload = () => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  }
  expect(unload()).toBe(false)
  expect(screen.queryByText('有尚未儲存的修改')).toBeNull()
  fireEvent.change(screen.getByLabelText('劇本名稱'), { target: { value: '公共運輸的取捨' } })
  expect(screen.getByText('有尚未儲存的修改')).toBeInTheDocument()
  expect(unload()).toBe(true)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '儲存草稿' })) })
  expect(unload()).toBe(false)
  expect(screen.queryByText('有尚未儲存的修改')).toBeNull()
})

test('empty YAML is explained before any request is sent', () => {
  render(<ScriptBuilder initial={null} onSaved={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: '匯入為新草稿' }))
  expect(importYAML).not.toHaveBeenCalled()
  expect(screen.getByLabelText('YAML 內容')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByRole('alert', { name: 'YAML 匯入錯誤' })).toHaveTextContent('請貼上 YAML 內容。')
  expect(screen.getByRole('status')).toHaveTextContent('YAML 匯入前需要內容。')
})

test('YAML schema 422 lists the exact field and reason', async () => {
  jest.mocked(importYAML).mockRejectedValue(new ApiError(422, [
    { loc: ['questions', 0, 'title'], msg: 'String should have at least 1 character', type: 'string_too_short', ctx: { min_length: 1 } },
  ]))
  render(<ScriptBuilder initial={null} onSaved={jest.fn()} />)
  fireEvent.change(screen.getByLabelText('YAML 內容'), { target: { value: 'title: 測試' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '匯入為新草稿' })) })
  expect(screen.getByRole('alert', { name: 'YAML 匯入錯誤' })).toHaveTextContent('情境 1・標題：請填寫')
  expect(screen.getByRole('status')).toHaveTextContent('YAML 匯入有 1 個欄位要修改。')
  expect(screen.getByRole('button', { name: '匯入為新草稿' })).toBeEnabled()
})

test('YAML parser 422 keeps the line and column explanation', async () => {
  jest.mocked(importYAML).mockRejectedValue(new ApiError(422, 'YAML 格式錯誤：第 2 行、第 1 欄：expected the node content'))
  render(<ScriptBuilder initial={null} onSaved={jest.fn()} />)
  fireEvent.change(screen.getByLabelText('YAML 內容'), { target: { value: 'title: [' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '匯入為新草稿' })) })
  expect(screen.getByRole('alert', { name: 'YAML 匯入錯誤' })).toHaveTextContent('YAML 格式錯誤：第 2 行、第 1 欄')
  expect(screen.getByRole('status')).toHaveTextContent('YAML 匯入格式待修改。')
})

test('a non-list 422 uses a readable message instead of the status code', async () => {
  jest.mocked(api).mockRejectedValue(new ApiError(422, {}))
  render(<ScriptBuilder initial={null} onSaved={jest.fn()} />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '儲存草稿' })) })
  expect(screen.getByRole('status')).toHaveTextContent('題目內容需要調整，請依畫面欄位提示修改。')
  expect(screen.getByRole('status')).not.toHaveTextContent('API 422')
})

test('YAML service recovery remains readable', async () => {
  jest.mocked(importYAML).mockRejectedValue(new ApiError(530, '服務正在恢復（HTTP 530），請稍後重試。'))
  render(<ScriptBuilder initial={null} onSaved={jest.fn()} />)
  fireEvent.change(screen.getByLabelText('YAML 內容'), { target: { value: 'title: 測試' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '匯入為新草稿' })) })
  expect(screen.getByRole('status')).toHaveTextContent('服務正在恢復（HTTP 530），請稍後重試。')
  expect(screen.getByRole('status')).not.toHaveTextContent('ApiError')
})
