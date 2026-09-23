import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, createSession, listSessions, type SessionHistoryItem } from '../api/client'

export default function Home() {
  const navigate = useNavigate()
  const [active, setActive] = useState<SessionHistoryItem | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    listSessions()
      .then((page) => setActive(page.items.find((item) => item.status === 'active') ?? null))
      .finally(() => setLoading(false))
  }, [])

  async function start(restart = false) {
    setBusy(true)
    setMessage('')
    try {
      const view = await createSession('trolley', restart)
      navigate(`/sessions/${view.session.id}`)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && active) {
        setMessage('你已有一段進行中的對話，可以繼續或重新開始。')
      } else {
        setMessage('入口已保留，請再試一次。')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="round1-page round1-home" data-testid="home-page">
      <section className="round1-card round1-hero">
        <p className="round1-kicker">Socrates · Round 1</p>
        <h1>照見你的立場</h1>
        <p>依序面對三個道德情境，說出選擇、理由與原則，再看見它們承受挑戰時如何變化。</p>
        {loading && <p className="round1-muted">正在讀取你的對話…</p>}
        {message && <p role="status" className="round1-notice">{message}</p>}
        <div className="round1-actions">
          {active ? (
            <>
              <button className="round1-primary" onClick={() => navigate(`/sessions/${active.id}`)} disabled={busy}>繼續上次對話</button>
              <button onClick={() => { void start(true) }} disabled={busy}>重新開始</button>
            </>
          ) : (
            <button className="round1-primary" onClick={() => { void start(false) }} disabled={busy}>開始討論</button>
          )}
          <button onClick={() => navigate('/history')}>查看歷史紀錄</button>
        </div>
      </section>
    </main>
  )
}
