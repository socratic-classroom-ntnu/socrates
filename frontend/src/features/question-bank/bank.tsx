import type { components } from '../../contract/classroomTypes'

// 型別一律取自產生的 classroomTypes（/bank/questions 的 response_model）
export type BankQuestion = components['schemas']['Question']
/** 搜尋結果的一列；開啟預覽後會帶上完整題目（BankQuestionDetail.question）。 */
export type BankItem = components['schemas']['BankQuestionSummary'] & Partial<Pick<components['schemas']['BankQuestionDetail'], 'question'>>
export type BankPage = components['schemas']['BankSearchResult']

export const BANK_PAGE_SIZE = 12
export const bankByline = (item: BankItem) => (item.mine ? '我發布的題目' : `${item.author || '其他老師'} 分享`)
export const bankSearchPath = (term: string, offset: number, limit = BANK_PAGE_SIZE) =>
  `/bank/questions?${new URLSearchParams({ q: term, offset: String(offset), limit: String(limit) })}`

export function BankTags({ tags }: { tags: string[] }) {
  if (!tags.length) return null
  return <ul className="bank-tags" aria-label="標籤">{tags.map(tag => <li key={tag}>#{tag}</li>)}</ul>
}
