import { useEffect, useState } from 'react'
import { api } from '../../api/classroomClient'
import type { components } from '../../api/classroomTypes'
import '../../styles/question-bank.css'

type Question = components['schemas']['Question']
type Samples = components['schemas']['SampleQuestionSet']

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * 範例題目只採用 ladder 原本的標題與情境；選項由老師自己填（產品決定）。
 * 不論後端回傳的範例有沒有選項、有幾個，一律換成兩列空白選項，不自動填任何文字。
 */
export function sampleQuestion(question: components['schemas']['SampleQuestionDraft']): Question {
  return { ...question, options: [{ id: 'a', text: '' }, { id: 'b', text: '' }] }
}

/** 「範例題目」：後端 /scripts/samples 把專案內建的情境（ladder 檔）轉成題目，老師挑選後放進草稿。 */
export function SamplePicker({ onPick }: { onPick: (question: Question) => string }) {
  const [samples, setSamples] = useState<Samples | null>(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    let live = true
    Promise.resolve(api('/scripts/samples'))
      .then((result: Samples) => { if (live) setSamples(result) })
      .catch(error => { if (live) setNote(message(error)) })
    return () => { live = false }
  }, [])

  return <div className="sc-card sample-picker">
    {note && <p role="status">{note}</p>}
    {!samples && !note && <p>正在讀取範例題目…</p>}
    {samples && <>
      <p>範例來源：{samples.title}。範例只提供標題與情境，選項請在加入後自行填寫，記得儲存草稿。</p>
      {!samples.questions.length && <p>目前沒有可用的範例題目。</p>}
      <ul className="sample-picker-list">{samples.questions.map(question => <li key={question.id}>
        <details><summary>{question.title}</summary>
          <p className="bank-scenario">{question.scenario}</p>
        </details>
        <button type="button" className="quiet" aria-label={`加入範例「${question.title}」到草稿`} onClick={() => setNote(onPick(sampleQuestion(question)))}>加入草稿</button>
      </li>)}</ul>
    </>}
  </div>
}
