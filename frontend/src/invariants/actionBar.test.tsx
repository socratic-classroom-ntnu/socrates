import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from '../testkit'
import ActionBar from '../components/ActionBar'

describe('ActionBar（不可妥協：前端不推導狀態）', () => {
  it('只渲染後端給的動作，不多不少', () => {
    render(<ActionBar actions={['advance', 'end']} onAction={vi.fn()} />)
    expect(screen.getByRole('button', { name: '進入下一個情境' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '結束討論' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '送出' })).not.toBeInTheDocument()
  })

  it('沒有可用動作時不渲染任何按鈕', () => {
    render(<ActionBar actions={[]} onAction={vi.fn()} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('點擊時把動作名稱原樣回報，不做任何轉譯', async () => {
    const onAction = vi.fn()
    render(<ActionBar actions={['end']} onAction={onAction} />)
    await userEvent.click(screen.getByRole('button', { name: '結束討論' }))
    expect(onAction).toHaveBeenCalledWith('end')
  })

  it('後端沒定義的動作名稱不可通過型別檢查', () => {
    // @ts-expect-error 'submit' 不在 Action union 裡。
    const invalid: Parameters<typeof ActionBar>[0]['actions'] = ['submit']
    expect(invalid).toBeDefined()
  })
})
