import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listSessions, type SessionHistoryItem } from '../api/client'

export default function History() {
  const navigate = useNavigate()
  const [items, setItems] = useState<SessionHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  function load() {
    setLoading(true)
    setFailed(false)
    listSessions()
      .then((page) => setItems(page.items))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  return (
    <main className="round1-page" data-testid="history-page">
      <section className="round1-card">
        <header className="round1-section-head">
          <div><p className="round1-kicker">Round 1</p><h1>歷史紀錄</h1></div>
          <button onClick={() => navigate('/')}>回到首頁</button>
        </header>
        {loading && <p className="round1-muted">正在整理對話紀錄…</p>}
        {failed && <div className="round1-notice"><p>紀錄入口已保留。</p><button onClick={load}>重新讀取</button></div>}
        {!loading && !failed && items.length === 0 && <p className="round1-muted">完成第一段對話後，這裡會保存你的總結。</p>}
        <div className="round1-history-grid">
          {items.map((item) => (
            <button
              key={item.id}
              className="round1-history-card"
              onClick={() => navigate(item.status === 'active' ? `/sessions/${item.id}` : `/sessions/${item.id}/summary`)}
            >
              <span className={`round1-status ${item.status}`}>{item.status === 'active' ? '進行中' : '已完成'}</span>
              <strong>{item.stage_title ?? `情境 ${item.current_stage_index + 1}`}</strong>
              <p>{item.summary_preview ?? `情境 ${item.current_stage_index + 1} / ${item.total_stages}`}</p>
              <time>{new Date(item.updated_at).toLocaleString('zh-TW')}</time>
            </button>
          ))}
        </div>
      </section>
    </main>
  )
}
