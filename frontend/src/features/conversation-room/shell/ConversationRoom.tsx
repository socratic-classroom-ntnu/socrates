import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { advanceSession, endSession, retry, sendMessage } from '../../../api/client'
import { InputComposer } from '../composer/InputComposer'
import { projectPresence } from '../model/presenceMachine'
import { confirmTranscriptDraft, createTranscriptDraft, getRoom, listHistory } from '../api/roomClient'
import type { Action, ConversationRoomView, InputState, SessionHistoryPage, TutorState } from '../model/types'
import { PortraitStage } from '../avatar/PortraitStage'
import './room.css'

function Icon({ name }: { name: 'menu' | 'history' | 'chat' | 'close' | 'plus' | 'arrow' | 'home' }) {
  const paths = {
    menu: 'M4 6h16M4 12h16M4 18h16', history: 'M4 4h16v16H4zM8 4v16M12 8h5M12 12h5',
    chat: 'M4 4h16v13H9l-5 4V4zM8 8h8M8 12h5', close: 'M6 6l12 12M18 6L6 18',
    plus: 'M12 5v14M5 12h14', arrow: 'M5 12h14M13 6l6 6-6 6', home: 'M3 10l9-7 9 7M5 9v11h14V9M10 20v-7h4v7',
  }
  return <svg focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}

const statusText = (s: string) => s === 'ended' ? '已完成' : '進行中'
const safePanelRead = (key: string) => { try { return localStorage.getItem(key) === 'open' } catch { return false } }

export function ConversationRoom({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate()
  const [room, setRoom] = useState<ConversationRoomView | null>(null)
  const [history, setHistory] = useState<SessionHistoryPage>({ items: [], next_cursor: null })
  const [leftOpen, setLeftOpen] = useState(() => safePanelRead('socratic.ce.history'))
  const [rightOpen, setRightOpen] = useState(() => safePanelRead('socratic.ce.transcript'))
  const [menuOpen, setMenuOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [transcript, setTranscript] = useState<{ id: string; text: string } | null>(null)
  const [inputState, setInputState] = useState<InputState>('idle')
  const [tutorState, setTutorState] = useState<TutorState>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requestOwner = useRef(sessionId)
  requestOwner.current = sessionId
  const messagesEnd = useRef<HTMLDivElement>(null)
  const menuButton = useRef<HTMLButtonElement>(null)

  const load = useCallback(async () => {
    const next = await getRoom(sessionId)
    if (requestOwner.current === sessionId) setRoom(next)
    return next
  }, [sessionId])
  const loadHistory = useCallback(async () => {
    try { setHistory(await listHistory()) } catch { /* History remains independently refreshable. */ }
  }, [])

  useEffect(() => {
    setRoom(null); setDraft(''); setTranscript(null); setError(''); setBusy(false); setTutorState('idle')
    void load().catch(() => setError('對話入口已保留，請按重新載入。'))
    void loadHistory()
  }, [load, loadHistory])
  useEffect(() => { try { localStorage.setItem('socratic.ce.history', leftOpen ? 'open' : 'closed') } catch { /* Session-only panel state remains active. */ } }, [leftOpen])
  useEffect(() => { try { localStorage.setItem('socratic.ce.transcript', rightOpen ? 'open' : 'closed') } catch { /* Session-only panel state remains active. */ } }, [rightOpen])
  useEffect(() => { messagesEnd.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }) }, [room?.detail.messages.length, rightOpen])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMenuOpen(false); setLeftOpen(false); setRightOpen(false); menuButton.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const openPanel = (side: 'left' | 'right') => {
    const compact = window.matchMedia('(max-width: 900px)').matches
    if (side === 'left') { setLeftOpen((v) => !v); if (compact) setRightOpen(false) }
    else { setRightOpen((v) => !v); if (compact) setLeftOpen(false) }
  }

  async function submit() {
    const text = draft.trim()
    if (!text || busy || !room?.detail.available_actions.includes('send_message')) return
    const owner = sessionId
    setBusy(true); setError(''); setTutorState('thinking')
    try {
      if (transcript && transcript.text === text) await confirmTranscriptDraft(owner, transcript.id)
      await sendMessage(owner, text)
      if (requestOwner.current !== owner) return
      setDraft(''); setTranscript(null); setInputState('idle')
      await load(); await loadHistory(); setTutorState('idle')
    } catch {
      if (requestOwner.current === owner) {
        setError('訊息已保留，可使用畫面上的續接動作。')
        await load().catch(() => undefined)
        setTutorState('idle')
      }
    } finally { if (requestOwner.current === owner) setBusy(false) }
  }
  async function receiveTranscript(text: string, confidence?: number) {
    setDraft(text); setInputState('typing'); setTranscript(null)
    const owner = sessionId
    try { const saved = await createTranscriptDraft(owner, text, confidence); if (requestOwner.current === owner) setTranscript({ id: saved.id, text }) }
    catch { setError('逐字稿已放入輸入框，可編輯後送出。') }
  }
  async function action(kind: Action) {
    if (busy) return
    const owner = sessionId
    setBusy(true); setError(''); setMenuOpen(false)
    try {
      if (kind === 'end') { await endSession(sessionId); navigate(`/sessions/${sessionId}/summary`); return }
      if (kind === 'advance') await advanceSession(sessionId)
      if (kind === 'retry') await retry(sessionId)
      await load(); await loadHistory()
    } catch { setError('目前對話已保留，可重新載入後續接。'); await load().catch(() => undefined) }
    finally { if (requestOwner.current === owner) setBusy(false) }
  }

  const messages = room?.detail.messages ?? []
  const lastTutor = [...messages].reverse().find((message) => message.role === 'tutor')
  const lastStudent = [...messages].reverse().find((message) => message.role === 'student')
  const actions = room?.detail.available_actions ?? []
  const ended = room?.detail.session.status === 'ended'
  const title = room?.detail.stage?.title ?? '蘇格拉底式對話'
  const presence = projectPresence(inputState, actions.includes('retry') ? 'thinking' : tutorState)
  const position = room ? room.detail.session.current_stage_index + 1 : 1
  const count = room?.detail.session.total_stages ?? 3

  return (
    <main className={`ce-room ${leftOpen ? 'ce-left-open' : ''} ${rightOpen ? 'ce-right-open' : ''}`} data-testid="conversation-room" data-ui-revision="ce-salon-v67">
      <header className="ce-header">
        <div className="ce-header-left">
          <button className="ce-icon-button" type="button" aria-label={leftOpen ? '收合歷史側欄' : '展開歷史側欄'} aria-expanded={leftOpen} aria-controls="ce-history" onClick={() => openPanel('left')}><Icon name="history" /></button>
          <button className="ce-wordmark" type="button" onClick={() => navigate('/')}><span className="ce-brand-icon" aria-hidden="true">S</span>Socrates<span>對話，讓想法更清晰。</span></button>
        </div>
        <div className="ce-topic"><span>情境 {position} / {count}</span><strong>{title}</strong><div className="ce-progress" aria-hidden="true">{Array.from({ length: count }, (_, i) => <i key={i} className={i < position ? 'filled' : ''} />)}</div></div>
        <div className="ce-header-right">
          <button className="ce-icon-button" type="button" aria-label={rightOpen ? '收合對話側欄' : '展開對話側欄'} aria-expanded={rightOpen} aria-controls="ce-transcript" onClick={() => openPanel('right')}><Icon name="chat" /></button>
          <button ref={menuButton} className="ce-icon-button ce-menu-trigger" type="button" aria-label="三槓選單" aria-expanded={menuOpen} aria-controls="ce-menu" onClick={() => setMenuOpen((v) => !v)}><Icon name="menu" /></button>
        </div>
      </header>

      {menuOpen && <><button className="ce-menu-backdrop" aria-label="收合選單" onClick={() => setMenuOpen(false)} /><nav id="ce-menu" className="ce-menu" aria-label="聊天室選單">
        <strong>聊天室選單</strong>
        <button onClick={() => { openPanel('left'); setMenuOpen(false) }}><Icon name="history" />歷史對話</button>
        <button onClick={() => { openPanel('right'); setMenuOpen(false) }}><Icon name="chat" />本次對話</button>
        <button onClick={() => navigate('/')}><Icon name="home" />回到首頁</button>
        <button disabled={busy} onClick={() => { if (ended) navigate(`/sessions/${sessionId}/summary`); else void action('end') }}><Icon name="arrow" />{ended ? '閱讀討論總結' : '結束並查看總結'}</button>
        <p>人像：TalkingHead / Ready Player Me<br />CC BY-NC 4.0 · 教學用途</p>
      </nav></>}

      {(leftOpen || rightOpen) && <button className="ce-mobile-scrim" aria-label="收合側欄" onClick={() => { setLeftOpen(false); setRightOpen(false) }} />}
      <aside id="ce-history" className="ce-drawer ce-history" aria-label="歷史對話" hidden={!leftOpen}>
        <div className="ce-panel-heading"><div><span>YOUR CONVERSATIONS</span><h2>歷史對話</h2></div><button className="ce-icon-button" aria-label="收合歷史側欄" onClick={() => setLeftOpen(false)}><Icon name="close" /></button></div>
        <button className="ce-new-chat" onClick={() => navigate('/')}><Icon name="plus" />開啟新的討論</button>
        <div className="ce-history-list">
          {history.items.length === 0 && <p className="ce-muted">你的對話將保留在這裡。</p>}
          {history.items.map((item) => <button key={item.id} className={`ce-history-item ${item.id === sessionId ? 'active' : ''}`} onClick={() => { if (window.innerWidth <= 900) setLeftOpen(false); navigate(item.status === 'ended' ? `/sessions/${item.id}/summary` : `/sessions/${item.id}`) }}>
            <strong>{item.stage_title ?? (item.status === 'ended' ? '已完成的對話' : '進行中的對話')}</strong>
            <span>{statusText(item.status)} · 情境 {item.current_stage_index + 1} / {item.total_stages}</span>
            <small>{new Date(item.updated_at ?? item.started_at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small>
          </button>)}
        </div>
        <button className="ce-panel-footer" onClick={() => navigate('/history')}>查看全部歷史 <Icon name="arrow" /></button>
      </aside>

      <section className="ce-stage" aria-label="導師與對話舞台">
        <div className="ce-stage-grid" aria-hidden="true" /><div className="ce-room-kicker"><span>THE SOCRATIC ROOM</span><p>留一點空間，<br />給正在成形的想法。</p></div>
        <PortraitStage state={presence} />
        <div className="ce-dialogue ce-tutor-dialogue" data-testid="tutor-dialogue" role="region" aria-label="導師目前的回覆" aria-live="polite">
          <div className="ce-bubble-label"><span className="ce-spark">✧</span> 蘇格拉底導師<span>{busy ? '思考中' : '給你的提問'}</span></div>
          <div className="ce-bubble-content">{lastTutor?.content ?? (error || '正在接回你的對話…')}</div>
          <button className="ce-dialogue-link" onClick={() => { setRightOpen(true); if (window.innerWidth <= 900) setLeftOpen(false) }}>展開完整對話 <Icon name="arrow" /></button>
        </div>
        {lastStudent && <div className="ce-dialogue ce-student-dialogue"><span>你的想法 / YOUR THOUGHT</span><p>{lastStudent.content}</p></div>}
        <div className="ce-stage-bottom">
          {error && <p className="ce-error" role="alert">{error} <button onClick={() => { setError(''); void load().catch(() => setError('對話入口已保留，請按重新載入。')) }}>重新載入</button></p>}
          <div className="ce-action-row">
            {actions.includes('advance') && <button className="ce-primary" disabled={busy} onClick={() => { void action('advance') }}>前往下一個情境 <Icon name="arrow" /></button>}
            {actions.includes('retry') && <button className="ce-primary" disabled={busy} onClick={() => { void action('retry') }}>續接導師回覆</button>}
            {ended && <button className="ce-primary" onClick={() => navigate(`/sessions/${sessionId}/summary`)}>閱讀討論總結 <Icon name="arrow" /></button>}
          </div>
          <div className="ce-composer-wrap">
            <InputComposer value={draft} busy={busy} enabled={actions.includes('send_message')} onChange={(value) => { setDraft(value); setInputState(value ? 'typing' : 'idle'); if (transcript?.text !== value) setTranscript(null) }} onListening={(active) => setInputState(active ? 'listening' : draft ? 'typing' : 'idle')} onTranscript={receiveTranscript} onSend={() => { void submit() }} />
          </div>
          <p className="ce-stage-note">從你的理由開始，慢慢找到自己的原則。</p>
        </div>
      </section>

      <aside id="ce-transcript" className="ce-drawer ce-transcript" aria-label="本次對話" hidden={!rightOpen}>
        <div className="ce-panel-heading"><div><span>CONVERSATION</span><h2>本次對話</h2></div><button className="ce-icon-button" aria-label="收合對話側欄" onClick={() => setRightOpen(false)}><Icon name="close" /></button></div>
        <div className="ce-transcript-list" role="log" aria-label="完整對話紀錄">
          {messages.map((message) => <article key={`${message.role}-${message.seq}`} className={`ce-transcript-message ${message.role}`}><span>{message.role === 'student' ? '你' : message.role === 'tutor' ? '蘇格拉底導師' : '情境紀錄'}</span><p>{message.content}</p></article>)}
          <div ref={messagesEnd} />
        </div>
        <div className="ce-panel-footer">情境 {position} / {count}<span>已讀取 {messages.length} 則訊息</span></div>
      </aside>
    </main>
  )
}
