import type { components } from '../../api/classroomTypes'

// /bank/* 沒有 response_model，型別照 backend/app/api/routes/question_bank.py 的回傳手寫
export type BankQuestion = components['schemas']['Question']
export type BankItem = {
  id: string
  title: string
  tags: string[]
  scenario_excerpt: string
  option_count: number
  author: string | null
  mine: boolean
  published_at: number
  revision: number
  question?: BankQuestion
}
export type BankPage = { items: BankItem[]; total: number; offset: number; limit: number }

export const BANK_PAGE_SIZE = 12
export const bankByline = (item: BankItem) => (item.mine ? '我發布的題目' : `${item.author || '其他老師'} 分享`)
export const bankSearchPath = (term: string, offset: number, limit = BANK_PAGE_SIZE) =>
  `/bank/questions?${new URLSearchParams({ q: term, offset: String(offset), limit: String(limit) })}`

export function BankTags({ tags }: { tags: string[] }) {
  if (!tags.length) return null
  return <ul className="bank-tags" aria-label="標籤">{tags.map(tag => <li key={tag}>#{tag}</li>)}</ul>
}
