import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  advanceSession,
  endSession,
  retry,
  sendMessage,
} from '../../../api/client'
import { AvatarStage } from '../avatar/AvatarStage'
import { InputComposer } from '../composer/InputComposer'
import { HistoryRail } from '../history/HistoryRail'
import { projectPresence } from '../model/presenceMachine'
import type {
  Action,
  ConversationRoomView,
  InputState,
  SessionHistoryPage,
  TutorState,
} from '../model/types'
import {
  confirmTranscriptDraft,
  createTranscriptDraft,
  getRoom,
  listHistory,
} from '../api/roomClient'
import { MessageTimeline } from '../timeline/MessageTimeline'
import { demoHistory, demoRoom } from '../test-fixtures/demoRoom'
import { RoomLayout } from './RoomLayout'
import { RoomTopBar } from './RoomTopBar'
import './room.css'

interface Props {
  sessionId: string
}

export function ConversationRoom({ sessionId }: Props) {
  const navigate = useNavigate()
  const acceptanceMode = useMemo(
    () => new URLSearchParams(window.location.search).get('acceptance') === '1',
    [],
  )
  const [room, setRoom] = useState<ConversationRoomView | null>(acceptanceMode ? demoRoom : null)
  const [history, setHistory] = useState<SessionHistoryPage>(acceptanceMode ? demoHistory : { items: [], next_cursor: null })
  const [draft, setDraft] = useState('')
  const [transcriptDraftId, setTranscriptDraftId] = useState<string | null>(null)
  const [tutorState, setTutorState] = useState<TutorState>('idle')
  const [inputState, setInputState] = useState<InputState>('idle')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [railOpen, setRailOpen] = useState(false)

  const refresh = useCallback(async () => {
    if (acceptanceMode) return demoRoom
    const next = await getRoom(sessionId)
    if (next.detail.session.status === 'ended') {
      navigate(`/sessions/${sessionId}/summary`, { replace: true })
      return next
    }
    setRoom(next)
    return next
  }, [acceptanceMode, navigate, sessionId])

  useEffect(() => {
    if (acceptanceMode) return
    setFailed(false)
    Promise.all([refresh(), listHistory()])
      .then(([, page]) => setHistory(page))
      .catch(() => setFailed(true))
  }, [acceptanceMode, refresh])

  async function submit() {
    const text = draft.trim()
    if (!text || busy || acceptanceMode) return
    setBusy(true)
    setFailed(false)
    setTutorState('thinking')
    try {
      if (transcriptDraftId) {
        await confirmTranscriptDraft(sessionId, transcriptDraftId)
      }
      await sendMessage(sessionId, text)
      setDraft('')
      setTranscriptDraftId(null)
      await refresh()
      setTutorState('speaking')
      window.setTimeout(() => setTutorState('idle'), 900)
      setHistory(await listHistory())
    } catch {
      setFailed(true)
      setTutorState('idle')
      try { await refresh() } catch { /* current view remains available */ }
    } finally {
      setBusy(false)
    }
  }

  async function handleTranscript(text: string, confidence?: number) {
    setDraft(text)
    setInputState('transcribing')
    if (acceptanceMode) {
      setInputState('typing')
      return
    }
    try {
      const saved = await createTranscriptDraft(sessionId, text, confidence)
      setTranscriptDraftId(saved.id)
    } finally {
      setInputState('typing')
    }
  }

  async function handleAction(action: Action) {
    if (acceptanceMode) return
    setBusy(true)
    setFailed(false)
    try {
      if (action === 'retry') await retry(sessionId)
      if (action === 'advance') await advanceSession(sessionId)
      if (action === 'end') {
        await endSession(sessionId)
        navigate(`/sessions/${sessionId}/summary`)
        return
      }
      await refresh()
    } catch {
      setFailed(true)
      try { await refresh() } catch { /* current view remains available */ }
    } finally {
      setBusy(false)
    }
  }

  if (!room) {
    return <main className="room-loading">{failed ? '對話載入需要重新整理。' : '載入對話中…'}</main>
  }

  const actions = room.detail.available_actions
  const canSpeak = actions.includes('send_message')
  const presence = projectPresence(inputState, tutorState)
  const title = room.detail.stage?.title ?? '蘇格拉底式對話'
  const subtitle = `情境 ${room.detail.session.current_stage_index + 1} / ${room.detail.session.total_stages}`

  return (
    <RoomLayout
      railOpen={railOpen}
      history={(
        <HistoryRail
          items={history.items}
          activeId={sessionId}
          open={railOpen}
          onClose={() => setRailOpen(false)}
          onNew={() => navigate('/')}
          onSelect={(item) => {
            setRailOpen(false)
            navigate(item.status === 'ended' ? `/sessions/${item.id}/summary` : `/sessions/${item.id}`)
          }}
        />
      )}
      header={(
        <RoomTopBar
          title={title}
          subtitle={subtitle}
          onOpenHistory={() => setRailOpen(true)}
          onEnd={() => { void handleAction('end') }}
          busy={busy}
        />
      )}
      avatar={<AvatarStage state={presence} />}
      timeline={(
        <>
          <MessageTimeline messages={room.detail.messages} />
          {failed && <p className="room-alert" role="alert">操作已保留在目前畫面，可依可用動作續接。</p>}
          {actions.includes('advance') && (
            <button className="room-advance" type="button" onClick={() => { void handleAction('advance') }} disabled={busy}>
              前往下一個情境
            </button>
          )}
          {actions.includes('retry') && (
            <button className="room-advance" type="button" onClick={() => { void handleAction('retry') }} disabled={busy}>
              重試教授回覆
            </button>
          )}
        </>
      )}
      composer={(
        <InputComposer
          value={draft}
          busy={busy}
          enabled={canSpeak || acceptanceMode}
          onChange={(value) => {
            setDraft(value)
            setInputState(value ? 'typing' : 'idle')
          }}
          onListening={(active) => setInputState(active ? 'listening' : draft ? 'typing' : 'idle')}
          onTranscript={handleTranscript}
          onSend={() => { void submit() }}
        />
      )}
    />
  )
}
