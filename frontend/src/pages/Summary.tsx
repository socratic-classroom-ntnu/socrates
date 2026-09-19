import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { createSummary, getSummary, type SummaryView } from '../api/client'

const STATUS_LABELS: Record<string, string> = {
  goal_met: '想清楚了',
  capped: '還沒有定見',
  stopped_early: '中途結束',
  skipped: '沒有走到',
  not_started: '沒有走到',
  in_progress: '進行中',
}

export default function Summary() {
  const { sessionId = '' } = useParams()
  const [summary, setSummary] = useState<SummaryView | null>(null)
  const [failed, setFailed] = useState(false)

  async function generate() {
    setFailed(false)
    try {
      setSummary(await createSummary(sessionId))
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    getSummary(sessionId)
      .then(setSummary)
      .catch(() => { void generate() })
  }, [sessionId])

  if (failed) {
    return (
      <main className="page">
        <p>整理失敗。</p>
        <button onClick={generate}>重試</button>
      </main>
    )
  }

  if (!summary) return <main className="page">教授正在整理你剛剛說的…</main>

  return (
    <main className="page">
      <h1>你的立場</h1>
      <p>{summary.core_principle}</p>
      <h2>你走過的情境</h2>
      <ul>
        {summary.stage_outcomes.map((outcome) => (
          <li key={outcome.index}>
            {outcome.title ?? `情境 ${outcome.index + 1}`} — {STATUS_LABELS[outcome.status]}
          </li>
        ))}
      </ul>
    </main>
  )
}
