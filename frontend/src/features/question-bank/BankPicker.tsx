import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../contract/classroomClient'
import { BANK_PAGE_SIZE, BankTags, bankByline, bankSearchPath } from './bank'
import type { BankItem, BankPage, BankQuestion } from './bank'
import '../../styles/question-bank.css'

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * 劇本編輯器裡的「從題庫加入」：搜尋與預覽沿用題庫商店的 /bank/questions，
 * 選中的題目交給 onPick 放進編輯中的草稿（不直接寫入已存的劇本，老師仍要自己儲存）。
 * onPick 回傳要顯示的提示文字。
 */
export function BankPicker({ onPick }: { onPick: (question: BankQuestion) => string }) {
  const [query, setQuery] = useState('')
  const [term, setTerm] = useState('')
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState<BankPage | null>(null)
  const [preview, setPreview] = useState<BankItem | null>(null)
  const [note, setNote] = useState('')
  const request = useRef(0)

  const load = useCallback(async () => {
    const revision = ++request.current
    try {
      const result: BankPage = await api(bankSearchPath(term, offset))
      if (revision === request.current) setPage(result)
    } catch (error) {
      if (revision === request.current) setNote(message(error))
    }
  }, [term, offset])
  useEffect(() => { void load(); return () => { request.current++ } }, [load])

  async function open(item: BankItem) {
    setNote('')
    try { setPreview(await api(`/bank/questions/${item.id}`)) } catch (error) { setNote(message(error)) }
  }

  function add() {
    if (!preview?.question) return
    setNote(onPick(preview.question))
    setPreview(null)
  }

  const pages = page ? Math.max(1, Math.ceil(page.total / BANK_PAGE_SIZE)) : 1
  const current = Math.floor(offset / BANK_PAGE_SIZE) + 1
  return <div className="sc-card bank-picker">
    <form role="search" className="bank-search" onSubmit={event => { event.preventDefault(); setOffset(0); setTerm(query.trim()) }}>
      <label>搜尋題庫<input type="search" maxLength={200} value={query} placeholder="輸入標題、情境或標籤" onChange={event => setQuery(event.target.value)}/></label>
      <button type="submit">搜尋</button>
    </form>
    {note && <p role="status">{note}</p>}
    {preview?.question && <section className="bank-preview" aria-label="題庫題目預覽">
      <small>{bankByline(preview)} · 版本 {preview.revision}</small>
      <h3>{preview.question.title}</h3>
      <p className="bank-scenario">{preview.question.scenario}</p>
      <ol>{preview.question.options.map(option => <li key={option.id}>{option.text}</li>)}</ol>
      <BankTags tags={preview.tags}/>
      <div className="sc-row">
        <button type="button" onClick={add}>加入草稿</button>
        <button type="button" className="quiet" onClick={() => setPreview(null)}>關閉預覽</button>
      </div>
    </section>}
    {!page && !note && <p>正在讀取題庫…</p>}
    {page && !page.items.length && <p>{term ? '找不到符合的題目，換個關鍵字試試。' : '題庫還是空的。'}</p>}
    {page && page.items.length > 0 && <ul className="bank-picker-list">{page.items.map(item => <li key={item.id}>
      <div><strong>{item.title}</strong><small>{bankByline(item)} · {item.option_count} 個選項</small><p>{item.scenario_excerpt}</p><BankTags tags={item.tags}/></div>
      <button type="button" className="quiet" aria-label={`預覽題庫題目「${item.title}」`} aria-pressed={preview?.id === item.id} onClick={() => void open(item)}>預覽</button>
    </li>)}</ul>}
    {pages > 1 && <nav className="sc-row" aria-label="題庫分頁">
      <button type="button" className="quiet" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - BANK_PAGE_SIZE))}>上一頁</button>
      <span>第 {current}／{pages} 頁</span>
      <button type="button" className="quiet" disabled={current >= pages} onClick={() => setOffset(offset + BANK_PAGE_SIZE)}>下一頁</button>
    </nav>}
  </div>
}
