import { useRef, useState } from 'react'
import { ApiError, api } from '../../api/classroomClient'
import '../../styles/question-bank.css'

import type { components } from '../../api/classroomTypes'

// GET /scripts 的一列（ScriptView）；document 照存檔原樣，所以逐欄確認型別再用
type ScriptRow = components['schemas']['ScriptView']
type ScriptQuestion = { id?: unknown; title?: unknown }

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** 題目卡上的「發布到題庫」：逐題發布到題庫商店，再次發布同一題會更新題庫裡那一筆。 */
export function PublishQuestions({ script, onNote }: { script: ScriptRow; onNote: (text: string) => void }) {
  const [busy, setBusy] = useState('')
  // 同一題重試時沿用同一個 action_id，後端才能去重
  const pending = useRef<Record<string, string>>({})
  const raw = script.document?.questions
  const questions = (Array.isArray(raw) ? (raw as ScriptQuestion[]) : []).filter(
    (q): q is { id: string; title: string } => typeof q?.id === 'string' && typeof q?.title === 'string',
  )
  if (!questions.length) return null

  async function publish(question: { id: string; title: string }) {
    if (busy) return
    pending.current[question.id] ??= crypto.randomUUID()
    setBusy(question.id)
    try {
      await api('/bank/questions', 'POST', { script_id: script.id, question_id: question.id, action_id: pending.current[question.id] })
      delete pending.current[question.id]
      onNote(`「${question.title}」已發布到題庫商店。`)
    } catch (error) {
      if (error instanceof ApiError && error.status && error.status < 500) delete pending.current[question.id]
      onNote(message(error))
    } finally { setBusy('') }
  }

  return <details className="bank-publish">
    <summary>發布到題庫</summary>
    <ul>{questions.map(question => <li key={question.id}>
      <span>{question.title}</span>
      <button className="teacher-quiet" disabled={!!busy} aria-label={`發布「${question.title}」到題庫`} onClick={() => void publish(question)}>{busy === question.id ? '發布中…' : '發布到題庫'}</button>
    </li>)}</ul>
  </details>
}
