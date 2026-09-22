interface Props {
  title: string
  subtitle: string
  onOpenHistory: () => void
  onEnd: () => void
  busy: boolean
}

export function RoomTopBar({ title, subtitle, onOpenHistory, onEnd, busy }: Props) {
  return (
    <header className="room-topbar">
      <button
        className="room-icon-button room-mobile-only"
        onClick={onOpenHistory}
        aria-label="開啟對話紀錄"
        type="button"
      >
        ☰
      </button>
      <div className="room-heading">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <div className="room-topbar-actions">
        <span className="room-version">CE Room · backend/arthur</span>
        <button type="button" onClick={onEnd} disabled={busy}>結束／總結</button>
      </div>
    </header>
  )
}
