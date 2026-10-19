import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ActivityFormModal } from './ActivityFormModal'

function setup(props: Partial<Parameters<typeof ActivityFormModal>[0]> = {}) {
  const onClose = jest.fn()
  const onSubmit = jest.fn()
  render(<ActivityFormModal onClose={onClose} onSubmit={onSubmit} {...props}/>)
  return { onClose, onSubmit }
}

test('選擇題預設 3 個選項加上固定的「其他」，最多 4 個、至少 2 個', () => {
  setup()
  fireEvent.click(screen.getByRole('radio', { name: '選擇題（選項＋理由）' }))

  expect(screen.getAllByRole('textbox', { name: /^選項 \d$/ })).toHaveLength(3)
  expect(screen.getByText('其他')).toBeInTheDocument()

  const add = screen.getByRole('button', { name: '增加選項+(最多四個)' })
  fireEvent.click(add)
  expect(screen.getAllByRole('textbox', { name: /^選項 \d$/ })).toHaveLength(4)
  expect(add).toBeDisabled()

  fireEvent.click(screen.getByRole('button', { name: '刪除選項 4' }))
  fireEvent.click(screen.getByRole('button', { name: '刪除選項 3' }))
  expect(screen.getAllByRole('textbox', { name: /^選項 \d$/ })).toHaveLength(2)
  expect(screen.queryByRole('button', { name: /^刪除選項/ })).not.toBeInTheDocument()
})

test('必填欄位沒填就按確認：顯示錯誤、不送出', () => {
  const { onSubmit } = setup()
  fireEvent.click(screen.getByRole('button', { name: '確認' }))

  expect(onSubmit).not.toHaveBeenCalled()
  expect(screen.getByText('請輸入活動名稱')).toBeInTheDocument()
  expect(screen.getByText('請選擇開始時間')).toBeInTheDocument()
  expect(screen.getByText('請輸入問題')).toBeInTheDocument()
  expect(screen.getByText(/尚未選擇答題類型/)).toHaveClass('activity-form-error')
  expect(screen.getByRole('textbox', { name: '* 活動名稱' })).toHaveAttribute('aria-invalid', 'true')

  // 改好之後錯誤會跟著消失
  fireEvent.change(screen.getByRole('textbox', { name: '* 活動名稱' }), { target: { value: '電車難題' } })
  expect(screen.queryByText('請輸入活動名稱')).not.toBeInTheDocument()
})

test('題目順序面板：用上下鍵調整順序後，表單裡的題目跟著換', () => {
  setup()
  fireEvent.click(screen.getByRole('button', { name: '新增題目' }))
  const titles = screen.getAllByRole('textbox', { name: '* 問題' })
  fireEvent.change(titles[0], { target: { value: '電車難題' } })
  fireEvent.change(titles[1], { target: { value: '政府調閱手機定位' } })

  fireEvent.click(screen.getByRole('button', { name: '調整順序' }))
  const panel = screen.getByRole('dialog', { name: '題目順序' })
  fireEvent.keyDown(within(panel).getByRole('button', { name: /^第 1 題：電車難題/ }), { key: 'ArrowDown' })

  expect(within(panel).getAllByRole('button', { name: /^第 \d 題/ }).map(b => b.getAttribute('aria-label')))
    .toEqual(['第 1 題：政府調閱手機定位，按上下鍵調整順序', '第 2 題：電車難題，按上下鍵調整順序'])
  expect(screen.getAllByRole('textbox', { name: '* 問題' }).map(i => (i as HTMLInputElement).value))
    .toEqual(['政府調閱手機定位', '電車難題'])
})

test('在題目順序面板按 Esc 只關面板，不關整個表單', async () => {
  const { onClose } = setup()
  fireEvent.click(screen.getByRole('button', { name: '新增題目' }))
  fireEvent.click(screen.getByRole('button', { name: '調整順序' }))
  fireEvent.keyDown(screen.getByRole('dialog', { name: '題目順序' }), { key: 'Escape' })

  // 退場動畫播完才會移除
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '題目順序' })).not.toBeInTheDocument())
  expect(onClose).not.toHaveBeenCalled()
})

test('AI出題幫手：沒有接上功能時顯示尚未開放', () => {
  setup()
  fireEvent.click(screen.getByRole('button', { name: 'AI 出題' }))
  expect(screen.getByRole('status')).toHaveTextContent('AI 出題還沒開放')
})

test('AI出題幫手：外面有傳 onAiAssist 時直接呼叫', () => {
  const onAiAssist = jest.fn()
  setup({ onAiAssist })
  fireEvent.click(screen.getByRole('button', { name: 'AI 出題' }))
  expect(onAiAssist).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('開始時間：先選日期再選時間，按確認後欄位顯示選好的值', () => {
  setup()
  fireEvent.click(screen.getByRole('button', { name: '* 開始時間' }))
  const dates = screen.getByRole('dialog', { name: '選擇開始時間' })
  const day = within(dates).getAllByRole('button', { name: /^\d+月\d+日/ }).find(b => !(b as HTMLButtonElement).disabled)!
  fireEvent.click(day)

  const times = screen.getByRole('dialog', { name: '選擇開始時間' })
  fireEvent.click(within(times).getByRole('button', { name: '下一個時' }))
  fireEvent.click(within(times).getByRole('button', { name: '02 分' }))
  fireEvent.click(within(times).getByRole('button', { name: '確認' }))

  expect(screen.getByRole('button', { name: '* 開始時間' })).toHaveTextContent('10:02')
})

test('兩題的答案類型各自獨立，不會連動', () => {
  setup()
  fireEvent.click(screen.getByRole('button', { name: '新增題目' }))
  const [first, second] = screen.getAllByRole('radiogroup', { name: '* 答案類型' })
  fireEvent.click(within(first).getByRole('radio', { name: '選擇題（選項＋理由）' }))

  expect(within(first).getByRole('radio', { name: '選擇題（選項＋理由）' })).toHaveAttribute('aria-checked', 'true')
  expect(within(second).getByRole('radio', { name: '選擇題（選項＋理由）' })).toHaveAttribute('aria-checked', 'false')
  expect(screen.getAllByRole('textbox', { name: /^選項 \d$/ })).toHaveLength(3)
})
