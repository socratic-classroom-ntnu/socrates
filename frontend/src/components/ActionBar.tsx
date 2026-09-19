import type { Action } from '../api/client'

const LABELS: Record<Action, string> = {
  send_message: '送出',
  advance: '進入下一個情境',
  end: '結束討論',
  retry: '重試',
}

type Props = {
  actions: readonly Action[]
  onAction: (action: Action) => void
  busy?: boolean
}

/**
 * 可用動作完全由後端的 `available_actions` 決定（設計規格 §9.1）。
 *
 * 這個元件**不知道 `flow_state` 是什麼**，也不該知道。
 * 任何「如果在路口就顯示某個按鈕」的判斷都屬於後端的狀態機，
 * 寫進前端就等於把狀態機實作了兩次，然後兩邊慢慢走鐘。
 */
export default function ActionBar({ actions, onAction, busy = false }: Props) {
  if (actions.length === 0) return null
  return (
    <div className="actions">
      {actions
        .filter((action) => action !== 'send_message')
        .map((action) => (
          <button key={action} onClick={() => onAction(action)} disabled={busy}>
            {LABELS[action]}
          </button>
        ))}
    </div>
  )
}
