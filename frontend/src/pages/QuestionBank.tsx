import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api } from '../api/classroomClient'
import '../styles/question-bank.css'
import { BANK_PAGE_SIZE as PAGE_SIZE, BankTags as Tags, bankByline as byline, bankSearchPath } from '../features/question-bank/bank'
import type { BankItem, BankPage } from '../features/question-bank/bank'

type ScriptRow = { id: string; revision: number; document: { title: string; questions: unknown[] } }

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function QuestionBank() {
  const [query, setQuery] = useState('')
  const [term, setTerm] = useState('')
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState<BankPage | null>(null)
  const [scripts, setScripts] = useState<ScriptRow[]>([])
  const [preview, setPreview] = useState<BankItem | null>(null)
  const [target, setTarget] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const request = useRef(0)
  // 同一個操作重試時沿用同一個 action_id，後端才能去重，不會因網路重送加入兩次
  const pending = useRef<{ key: string; action_id: string } | null>(null)

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

  const loadScripts = useCallback(async () => {
    try {
      const rows: ScriptRow[] = await api('/scripts')
      setScripts(rows)
      setTarget(value => (rows.some(row => row.id === value) ? value : rows[0]?.id || ''))
    } catch (error) {
      setNote(message(error))
    }
  }, [])
  useEffect(() => { void loadScripts() }, [loadScripts])

  async function change(path: string, body: Record<string, unknown>) {
    if (busy) return null
    const key = JSON.stringify([path, body])
    const intent = pending.current?.key === key ? pending.current : { key, action_id: crypto.randomUUID() }
    pending.current = intent
    setBusy(true); setNote('')
    try {
      const result = await api(path, 'POST', { ...body, action_id: intent.action_id })
      pending.current = null
      return result
    } catch (error) {
      if (error instanceof ApiError && error.status && error.status < 500) pending.current = null
      setNote(message(error))
      return null
    } finally { setBusy(false) }
  }

  async function open(item: BankItem) {
    setNote('')
    try { setPreview(await api(`/bank/questions/${item.id}`)) } catch (error) { setNote(message(error)) }
  }

  async function addToScript() {
    if (!preview || !target) return
    const result = await change(`/bank/questions/${preview.id}/import`, { script_id: target })
    if (!result) return
    const title = scripts.find(row => row.id === target)?.document.title || '課程腳本'
    setNote(`已加入「${title}」，現在共 ${result.document.questions.length} 題。`)
    void loadScripts()
  }

  async function unpublish() {
    if (!preview || !window.confirm(`確定要把「${preview.title}」從題庫商店下架嗎？已加入其他劇本的題目不受影響。`)) return
    const result = await change(`/bank/questions/${preview.id}/unpublish`, {})
    if (!result) return
    setPreview(null); setNote('已從題庫商店下架。')
    void load()
  }

  const pages = page ? Math.max(1, Math.ceil(page.total / PAGE_SIZE)) : 1
  const current = Math.floor(offset / PAGE_SIZE) + 1
  return <section className="r73-library bank-store">
    <header className="r2-section-title">
      <div><small>題目分享</small><h1>題庫商店</h1><p>搜尋其他老師分享的題目，預覽後加入自己的課程腳本。</p></div>
    </header>
    <form role="search" className="bank-search" onSubmit={event => { event.preventDefault(); setOffset(0); setTerm(query.trim()) }}>
      <label>搜尋題庫<input type="search" value={query} placeholder="輸入標題、情境或標籤" onChange={event => setQuery(event.target.value)}/></label>
      <button className="teacher-primary">搜尋</button>
    </form>
    {note && <p role="status" className="teacher-note">{note}</p>}
    {preview && <section className="r2-card bank-preview" aria-label="題目預覽">
      <div className="r2-row"><small>{byline(preview)} · 版本 {preview.revision}</small><button className="teacher-quiet" onClick={() => setPreview(null)}>關閉預覽</button></div>
      <h2>{preview.title}</h2>
      {preview.question && <>
        {preview.question.title !== preview.title && <h3>{preview.question.title}</h3>}
        <p className="bank-scenario">{preview.question.scenario}</p>
        <h3>選項</h3>
        <ol>{preview.question.options.map(option => <li key={option.id}>{option.text}</li>)}</ol>
        <p>作答 {preview.question.duration_seconds} 秒 · {preview.question.argument_required ? '需要寫下理由' : '理由可不填'}</p>
      </>}
      <Tags tags={preview.tags}/>
      <div className="r2-row bank-import">
        <label>加入哪一份課程腳本<select aria-label="加入哪一份課程腳本" value={target} disabled={busy || !scripts.length} onChange={event => setTarget(event.target.value)}>
          <option value="" disabled>選擇課程腳本</option>
          {scripts.map(script => <option key={script.id} value={script.id}>{script.document.title}（{script.document.questions.length} 題）</option>)}
        </select></label>
        <button className="teacher-primary" disabled={busy || !target} onClick={() => void addToScript()}>{busy ? '處理中…' : '加入我的課程腳本'}</button>
        {preview.mine && <button className="teacher-quiet" disabled={busy} onClick={() => void unpublish()}>從題庫下架</button>}
      </div>
      {!scripts.length && <small>你還沒有課程腳本。先到「個人題庫」新增一份，再回來加入。</small>}
    </section>}
    {!page && !note && <p role="status">正在讀取題庫…</p>}
    {page && !page.items.length && <section className="r2-card">
      <h2>{term ? '找不到符合的題目' : '題庫還是空的'}</h2>
      <p>{term ? '換個關鍵字試試，或清空搜尋查看全部題目。' : '在個人題庫或課程的題目卡上按「發布到題庫」，就能分享給其他老師。'}</p>
    </section>}
    {page && page.items.length > 0 && <>
      <div className="r2-section-title"><h2>{term ? `「${term}」的搜尋結果` : '最新分享'} <small>{page.total} 題</small></h2></div>
      <div className="r2-script-grid">{page.items.map(item => <article key={item.id} className="r2-card">
        <small>{byline(item)}</small>
        <h3>{item.title}</h3>
        <p>{item.scenario_excerpt}</p>
        <span>{item.option_count} 個選項</span>
        <Tags tags={item.tags}/>
        <button className="teacher-quiet" aria-label={`預覽「${item.title}」`} aria-pressed={preview?.id === item.id} onClick={() => void open(item)}>預覽題目</button>
      </article>)}</div>
      {pages > 1 && <nav className="r2-row" aria-label="題庫分頁">
        <button className="teacher-quiet" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>上一頁</button>
        <span>第 {current}／{pages} 頁</span>
        <button className="teacher-quiet" disabled={current >= pages} onClick={() => setOffset(offset + PAGE_SIZE)}>下一頁</button>
      </nav>}
    </>}
  </section>
}
