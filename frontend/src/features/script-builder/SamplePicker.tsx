import { useEffect, useState } from 'react'
import { api } from '../../api/classroomClient'
import type { components } from '../../api/classroomTypes'
import '../../styles/question-bank.css'

type Question = components['schemas']['Question']
type Samples = { title: string; questions: Question[] }

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

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

  return <div className="r2-card sample-picker">
    {note && <p role="status">{note}</p>}
    {!samples && !note && <p>正在讀取範例題目…</p>}
    {samples && <>
      <p>範例來源：{samples.title}。加入後可以再修改，記得儲存草稿。</p>
      {!samples.questions.length && <p>目前沒有可用的範例題目。</p>}
      <ul className="sample-picker-list">{samples.questions.map(question => <li key={question.id}>
        <details><summary>{question.title}</summary>
          <p className="bank-scenario">{question.scenario}</p>
          <ol>{question.options.map(option => <li key={option.id}>{option.text}</li>)}</ol>
        </details>
        <button type="button" className="quiet" aria-label={`加入範例「${question.title}」到草稿`} onClick={() => setNote(onPick(question))}>加入草稿</button>
      </li>)}</ul>
    </>}
  </div>
}
