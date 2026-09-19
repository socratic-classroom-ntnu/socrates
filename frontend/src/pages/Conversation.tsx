import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ActionBar from '../components/ActionBar'
import MessageList from '../components/MessageList'
import ProgressIndicator from '../components/ProgressIndicator'
import {
  endSession, getSession, retry, sendMessage,
  type Action, type SessionDetail,
} from '../api/client'

export default function Conversation() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const [view, setView] = useState<SessionDetail | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    getSession(sessionId).then((detail) => {
      if (detail.session.status === 'ended') {
        navigate(`/sessions/${sessionId}/summary`, { replace: true })
      } else {
        setView(detail)
      }
    }).catch(() => setFailed(true))
  }, [sessionId, navigate])

  async function refresh() {
    const detail = await getSession(sessionId)
    if (detail.session.status === 'ended') {
      navigate(`/sessions/${sessionId}/summary`)
    } else {
      setView(detail)
    }
    return detail
  }

  async function submit() {
    const submitted = draft
    const previousSeq = view?.messages.at(-1)?.seq ?? -1
    setBusy(true)
    setFailed(false)
    try {
      await sendMessage(sessionId, submitted)
      setDraft('')
      await refresh()
    } catch {
      setFailed(true)
      try {
        const detail = await refresh()
        if (detail.messages.some((message) =>
          message.seq > previousSeq && message.role === 'student' && message.content === submitted
        )) {
          setDraft('')
        }
      } catch { /* 留在目前畫面供重試 */ }
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    setBusy(true)
    setFailed(false)
    try {
      await retry(sessionId)
      setDraft('')
      await refresh()
    } catch {
      setFailed(true)
      try { await refresh() } catch { /* 留在目前畫面供重試 */ }
    } finally {
      setBusy(false)
    }
  }

  async function handleAction(action: Action) {
    if (action === 'retry') {
      await resend()
      return
    }
    if (action !== 'end') return
    const ok = window.confirm(
      '結束後這次討論會封存並產生總結，之後可以再開新的一輪，但無法回到這一次。要結束嗎？',
    )
    if (!ok) return
    setBusy(true)
    setFailed(false)
    try {
      await endSession(sessionId)
      navigate(`/sessions/${sessionId}/summary`)
    } catch {
      setFailed(true)
      try { await refresh() } catch { /* 留在目前畫面供重試 */ }
    } finally {
      setBusy(false)
    }
  }

  if (!view) return <main className="page">{failed ? '讀取對話失敗，請重新整理。' : '載入中…'}</main>

  const canSpeak = view.available_actions.includes('send_message')
  return (
    <main className="page">
      <ProgressIndicator
        currentIndex={view.session.current_stage_index}
        total={view.session.total_stages}
      />
      <MessageList messages={view.messages} />
      {failed && <p role="alert">操作失敗，請依目前可用動作重試。</p>}
      {canSpeak && (
        <>
          <textarea
            rows={4}
            maxLength={2000}
            value={draft}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="你的回應"
          />
          <div className="actions">
            <button onClick={submit} disabled={busy || draft.trim() === ''}>送出</button>
          </div>
        </>
      )}
      <ActionBar actions={view.available_actions} onAction={handleAction} busy={busy} />
    </main>
  )
}
