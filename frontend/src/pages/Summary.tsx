import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
  const navigate = useNavigate()
  const [summary, setSummary] = useState<SummaryView | null>(null)
  const [failed, setFailed] = useState(false)

  async function generate() {
    setFailed(false)
    try { setSummary(await createSummary(sessionId)) } catch { setFailed(true) }
  }

  useEffect(() => {
    getSummary(sessionId).then(setSummary).catch(() => { void generate() })
  }, [sessionId])

  if (failed) {
    return (
      <main className="round1-page" data-testid="summary-error">
        <section className="round1-card"><h1>總結入口已保留</h1><button onClick={generate}>重新整理</button></section>
      </main>
    )
  }

  if (!summary) return <main className="round1-page" data-testid="summary-loading"><section className="round1-card">教授正在整理你剛剛說的…</section></main>

  const keyPoints = summary.key_points ?? []

  return (
    <main className="round1-page" data-testid="summary-page">
      <section className="round1-card round1-summary-card">
        <p className="round1-kicker" data-testid="discussion-topic">{summary.discussion_topic}</p>
        <h1>你的立場</h1>
        <blockquote>{summary.core_principle}</blockquote>
        <section>
          <h2>討論重點</h2>
          <ul data-testid="discussion-key-points">{keyPoints.map((point) => <li key={point}>{point}</li>)}</ul>
        </section>
        {summary.tension && <section><h2>核心張力</h2><p>{summary.tension}</p></section>}
        {summary.reflection_excerpt && <section><h2>你的原話</h2><p>{summary.reflection_excerpt}</p></section>}
        <section>
          <h2>你走過的情境</h2>
          <div className="round1-outcomes">
            {summary.stage_outcomes.map((outcome) => (
              <article key={outcome.index} className={`round1-outcome ${outcome.status}`}>
                <span>情境 {outcome.index + 1}</span>
                <strong>{outcome.title ?? '保留到下一次相遇'}</strong>
                <em>{STATUS_LABELS[outcome.status]}</em>
              </article>
            ))}
          </div>
        </section>
        <div className="round1-actions" data-testid="summary-exit">
          <button className="round1-primary" onClick={() => navigate('/history')}>回到歷史紀錄</button>
          <button onClick={() => navigate('/')}>退出至首頁</button>
        </div>
      </section>
    </main>
  )
}
