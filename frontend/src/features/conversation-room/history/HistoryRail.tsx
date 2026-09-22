import type { SessionHistoryItem } from '../model/types'

interface Props {
  items: SessionHistoryItem[]
  activeId: string
  open: boolean
  onClose: () => void
  onNew: () => void
  onSelect: (item: SessionHistoryItem) => void
}

function groupLabel(item: SessionHistoryItem): string {
  const started = new Date(item.started_at)
  const today = new Date()
  if (started.toDateString() === today.toDateString()) return '今天'
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (started.toDateString() === yesterday.toDateString()) return '昨天'
  return '更早'
}

export function HistoryRail({ items, activeId, open, onClose, onNew, onSelect }: Props) {
  const groups = ['今天', '昨天', '更早'].map((label) => ({
    label,
    items: items.filter((item) => groupLabel(item) === label),
  })).filter((group) => group.items.length > 0)

  return (
    <aside className={`history-rail ${open ? 'is-open' : ''}`} aria-label="對話紀錄">
      <div className="history-head">
        <div><span className="history-eyebrow">SOCRATIC</span><h1>對話紀錄</h1></div>
        <button className="room-icon-button room-mobile-only" onClick={onClose} aria-label="關閉對話紀錄" type="button">×</button>
      </div>
      <button className="new-chat" onClick={onNew} type="button">＋ 新對話</button>
      <nav className="history-list">
        {groups.map((group) => (
          <section key={group.label} className="history-group">
            <h2>{group.label}</h2>
            {group.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`history-item ${item.id === activeId ? 'active' : ''}`}
                onClick={() => onSelect(item)}
              >
                <strong>{item.status === 'active' ? '進行中的對話' : '已完成的對話'}</strong>
                <span>{item.summary_preview ?? `情境 ${item.current_stage_index + 1} / ${item.total_stages}`}</span>
                <time>{new Date(item.started_at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
              </button>
            ))}
          </section>
        ))}
      </nav>
      <div className="history-footer"><span className="history-status-dot" /> backend/arthur</div>
    </aside>
  )
}
