import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ActionBar from '../components/ActionBar'
import {
  advanceSession, endSession, getSession, retry, sendMessage,
  type Action, type SessionDetail,
} from '../api/client'
import '../styles/classroom-discussion.css'

export default function Conversation() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const [view, setView] = useState<SessionDetail | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    getSession(sessionId).then((detail) => {
      if (detail.session.status === 'ended') navigate(`/sessions/${sessionId}/summary`, { replace: true })
      else setView(detail)
    }).catch(() => setFailed(true))
  }, [sessionId, navigate])

  async function refresh() {
    const detail = await getSession(sessionId)
    if (detail.session.status === 'ended') navigate(`/sessions/${sessionId}/summary`)
    else setView(detail)
    return detail
  }

  async function submit() {
    if (busy || !draft.trim() || !view?.available_actions.includes('send_message')) return
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
        if (detail.messages.some((message) => message.seq > previousSeq && message.role === 'student' && message.content === submitted)) setDraft('')
      } catch { /* refresh failed */ }
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
      try { await refresh() } catch { /* refresh failed */ }
    } finally {
      setBusy(false)
    }
  }

  async function handleAction(action: Action) {
    if (busy || !view?.available_actions.includes(action)) return
    if (action === 'retry') {
      await resend()
      return
    }

    if (action === 'advance') {
      setBusy(true)
      setFailed(false)
      try {
        await advanceSession(sessionId)
        await refresh()
      } catch {
        try {
          const detail = await refresh()
          if (detail.available_actions.includes('advance')) setFailed(true)
        } catch { setFailed(true) }
      } finally {
        setBusy(false)
      }
      return
    }

    if (action !== 'end') return
    if (!window.confirm('結束後這次討論會封存並產生總結，之後可以再開新的一輪，但無法回到這一次。要結束嗎？')) return

    setBusy(true)
    setFailed(false)
    try {
      await endSession(sessionId)
      navigate(`/sessions/${sessionId}/summary`)
    } catch {
      setFailed(true)
      try { await refresh() } catch { /* refresh failed */ }
    } finally {
      setBusy(false)
    }
  }

  if (!view) return <main className="page">{failed ? '載入失敗，請重新整理頁面。' : '載入中...'}</main>

  const canSpeak = view.available_actions.includes('send_message')
  const canAdvance = view.available_actions.includes('advance')
  const studentMessages = view.messages.filter((message) => message.role === 'student')
  const latestStudentMessage = studentMessages.at(-1)

  return (
    <main className="r2-classroom session-classroom">
      <section className="classroom-discussion">
      <div className="classroom-discussion-progress">
        情境 {view.session.current_stage_index + 1} / {view.session.total_stages}
      </div>

      <div className="classroom-discussion-identity">
        <span>A</span>
        <strong>你</strong>
      </div>

      <div className="classroom-discussion-presence">● 你在台上</div>

      <h1 className="classroom-discussion-title">{view.stage?.title ?? '蘇格拉底式對話'}</h1>

      <aside className="classroom-answer-history">
        <h2>我的紀錄</h2>
        {latestStudentMessage ? (
          <>
            <small>我剛剛說過</small>
            <p>{latestStudentMessage.content}</p>
          </>
        ) : (
          <p>你的回答會顯示在這裡。</p>
        )}
      </aside>

      <section className="classroom-discussion-transcript" aria-label="目前對話紀錄">
        <h2>目前對話</h2>
        <div className="classroom-transcript-content">
          {view.messages.map((message) => (
            <div key={message.seq} className={`r2-message ${message.role}`}>
              <small>{message.role === 'student' ? '你' : message.role === 'tutor' ? '蘇格拉底' : '情境'}</small>
              <p>{message.content}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="r2-live-dialog">
        <small>{canSpeak ? '回答目前問題' : '等待下一個問題'}</small>

        {failed && <p role="alert">操作失敗，請稍後再試。</p>}

        {canAdvance && (
          <p>還有 {view.session.total_stages - view.session.current_stage_index - 1} 個情境</p>
        )}

          <div className="session-answer-controls">
        {canSpeak && (
          <>
            <textarea
              rows={4}
              maxLength={2000}
              value={draft}
              disabled={busy}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="輸入你的想法..."
              aria-label="你的回應"
            />

            <div className="classroom-answer-buttons">
              <button type="button" className="classroom-mic" disabled>🎙 用說的</button>
              <button type="button" className="classroom-send" aria-label="送出" onClick={submit} disabled={busy || draft.trim() === ''}>↵ 送出</button>
            </div>
          </>
        )}

        <ActionBar actions={view.available_actions} onAction={handleAction} busy={busy} />
          </div>
      </section>
      </section>
    </main>
  )
}
