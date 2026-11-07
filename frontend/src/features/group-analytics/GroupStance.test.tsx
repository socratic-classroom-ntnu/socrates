import { render, screen, within } from '@testing-library/react'
import { GroupStance, type GroupStanceData } from './GroupStance'

const none = { probing: 0, awaiting_confirm: 0, unclear: 0, capped: 0, incomplete: 0, unavailable: 0, not_answered: 0 }
const base: GroupStanceData = {
  question_index: 0,
  question_title: '如何安排共同資源？',
  members: 4,
  confirmed: 3,
  unconfirmed: 1,
  unconfirmed_by_status: { ...none, unclear: 1 },
  options: [
    { option_id: 'a', text: '先到先取', count: 2, percent: 200 / 3 },
    { option_id: 'b', text: '平均分配', count: 1, percent: 100 / 3 },
    { option_id: '__other__', text: '其他', count: 0, percent: 0 },
  ],
  differing: true,
}

test('每個選項以文字列出已確認人數，並標示未確認與立場分歧', () => {
  render(<GroupStance stance={base} />)
  const region = screen.getByRole('region', { name: '第 1 題立場分布' })
  expect(within(region).getAllByRole('listitem').map(r => r.textContent)).toEqual(['先到先取2 人', '平均分配1 人', '其他0 人'])
  expect(region).toHaveTextContent('已確認 3 / 4')
  expect(region).toHaveTextContent('未確認 1（暫時無法釐清 1）')
  expect(within(region).getByText('立場分歧')).toBeInTheDocument()
})

test('長條寬度依已確認基準的比例', () => {
  const { container } = render(<GroupStance stance={base} />)
  const bars = [...container.querySelectorAll('.group-stance-bar > span')] as HTMLElement[]
  expect(bars.map(b => Math.round(parseFloat(b.style.width)))).toEqual([67, 33, 0])
})

test('所有基準都在同一個選項時顯示立場一致，未確認列出原因', () => {
  render(<GroupStance stance={{
    ...base,
    confirmed: 2,
    unconfirmed: 2,
    unconfirmed_by_status: { ...none, probing: 1, not_answered: 1 },
    options: [{ option_id: 'a', text: '先到先取', count: 2, percent: 100 }, { option_id: 'b', text: '平均分配', count: 0, percent: 0 }],
    differing: false,
  }} />)
  expect(screen.getByText('立場一致')).toBeInTheDocument()
  expect(screen.getByText('未確認 2（對話中 1 · 未作答 1）')).toBeInTheDocument()
})

test('還沒有人確認基準時不宣稱一致', () => {
  render(<GroupStance stance={{
    ...base,
    confirmed: 0,
    unconfirmed: 4,
    unconfirmed_by_status: { ...none, probing: 4 },
    options: base.options.map(o => ({ ...o, count: 0, percent: 0 })),
    differing: false,
  }} />)
  expect(screen.getByText('尚無確認')).toBeInTheDocument()
  expect(screen.queryByText('立場一致')).toBeNull()
  expect(screen.getByText('未確認 4（對話中 4）')).toBeInTheDocument()
})

test('題目尚未開始時顯示說明', () => {
  render(<GroupStance stance={null} />)
  expect(screen.getByText('題目尚未開始，還沒有立場分布。')).toBeInTheDocument()
})
