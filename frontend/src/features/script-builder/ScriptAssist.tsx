import { useState } from 'react'
import { ApiError, scriptAssist } from '../../api/classroomClient'

const NEW = 'new'

function message(error) {
  return error instanceof ApiError ? error.message : String(error)
}

/** 把建議放進草稿：改寫既有題目時保留該題的 id 與指定模型；新增題目時避開重複的 id。 */
export function applySuggestion(document, suggestion) {
  const questions = document.questions || []
  const index = suggestion.question_index
  if (Number.isInteger(index) && questions[index]) {
    return {
      ...document,
      questions: questions.map((q, i) => (i === index ? { ...q, ...suggestion.question, id: q.id } : q)),
    }
  }
  const taken = new Set(questions.map(q => q.id))
  const base = String(suggestion.question.id).slice(0, 60)
  let id = base
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`
  return { ...document, questions: [...questions, { ...suggestion.question, id }] }
}

/** AI 協助設計：老師寫下需求，後端以帳號「AI 劇本協作」模型提出一題建議，老師確認後才放進草稿。 */
export function ScriptAssist({ document, onApply, scriptId = null }) {
  const questions = document.questions || []
  const [request, setRequest] = useState('')
  const [target, setTarget] = useState(NEW)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [suggestion, setSuggestion] = useState(null)
  const [note, setNote] = useState('')

  async function ask() {
    if (busy || !request.trim()) return
    setBusy(true)
    setError('')
    setNote('')
    setSuggestion(null)
    try {
      const index = target === NEW ? null : Number(target)
      setSuggestion(await scriptAssist({
        request: request.trim(),
        document,
        question_index: index,
        script_id: scriptId,
      }))
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  function apply() {
    const replacing = Number.isInteger(suggestion.question_index) && questions[suggestion.question_index]
    onApply(applySuggestion(document, suggestion))
    setNote(replacing
      ? `已套用到情境 ${suggestion.question_index + 1}；確認內容後記得儲存草稿。`
      : '已加入為新題目；確認內容後記得儲存草稿。')
    setSuggestion(null)
  }

  const q = suggestion?.question
  const replacing = suggestion && Number.isInteger(suggestion.question_index) && questions[suggestion.question_index]
  return <div className="r2-card script-assist">
    <p>寫下想要的情境或修改方向，AI 會依目前草稿提出一題建議；建議不會自動寫入，確認後再套用。使用的模型在帳號 AI 設定的「AI 劇本協作」。</p>
    <label>想請 AI 怎麼協助？<textarea rows={3} value={request} placeholder="例如：設計一題關於校園資源分配、適合高中生的兩難情境" onChange={e => setRequest(e.target.value)}/></label>
    <label>要處理的題目<select value={target} onChange={e => setTarget(e.target.value)}>
      <option value={NEW}>新增一題</option>
      {questions.map((item, i) => <option key={item.id} value={String(i)}>改寫情境 {i + 1}：{item.title}</option>)}
    </select></label>
    <button type="button" disabled={busy || !request.trim()} aria-busy={busy} onClick={() => void ask()}>{busy ? 'AI 構思中…' : '請 AI 提出建議'}</button>
    {error && <p className="r2-field-errors" role="alert">{error}</p>}
    {q && <section className="script-assist-suggestion" aria-label="AI 建議">
      <h3>{q.title}</h3>
      <p>{q.scenario}</p>
      <ol>{q.options.map(o => <li key={o.id}>{o.text}</li>)}</ol>
      <p><strong>教學目標：</strong>{q.tutor_goal}</p>
      {q.probe_hints?.length > 0 && <ul aria-label="建議追問">{q.probe_hints.map(hint => <li key={hint}>{hint}</li>)}</ul>}
      {suggestion.rationale && <p><small>設計說明：{suggestion.rationale}</small></p>}
      {suggestion.model && <p><small>由 {suggestion.model} 產生</small></p>}
      <div className="r2-row">
        <button type="button" onClick={apply}>{replacing ? `套用到情境 ${suggestion.question_index + 1}` : '加入為新題目'}</button>
        <button type="button" className="quiet" onClick={() => setSuggestion(null)}>捨棄建議</button>
      </div>
    </section>}
    {note && <p aria-live="polite">{note}</p>}
  </div>
}
