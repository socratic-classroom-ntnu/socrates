import { useEffect, useRef } from 'react'
import { useT } from '../../../i18n/useT'
import { can, stanceLabel, type SoloAttemptView, type SoloQuestion } from './soloView'

const FOLLOW_LATEST_THRESHOLD = 96

type Props = {
  view: SoloAttemptView
  pendingStudent?: { text: string; first: boolean } | null
  waiting?: boolean
  retrying?: boolean
  onRetry?: () => void
}

export function SoloTimeline({ view, pendingStudent = null, waiting = false, retrying = false, onRetry }: Props) {
  const { t } = useT('solo')
  const timelineRef = useRef<HTMLElement>(null)
  const followLatest = useRef(true)
  const messages = withoutConfirmingFollowUp(view)
  const question = view.questions.find(item => item.index === view.question_index)
  const contentKey = `${messages.map(message => message.id).join(':')}|${pendingStudent?.text ?? ''}|${waiting}`
  // Instant, not smooth: a smooth scroll is dropped when the layout changes mid-animation.
  function showLatest() {
    const timeline = timelineRef.current
    if (timeline && followLatest.current && typeof timeline.scrollTo === 'function') {
      timeline.scrollTo({ top: timeline.scrollHeight, behavior: 'auto' })
    }
  }

  useEffect(showLatest, [contentKey])

  // The composer below changes height (waiting hint, X2 notice), and fonts load after the
  // first render; either shortens the timeline, so stay on the latest message when it does.
  useEffect(() => {
    const timeline = timelineRef.current
    if (!timeline || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(showLatest)
    observer.observe(timeline)
    return () => observer.disconnect()
  }, [])

  function trackScroll() {
    const timeline = timelineRef.current
    if (!timeline) return
    const distanceFromBottom = timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight
    followLatest.current = distanceFromBottom <= FOLLOW_LATEST_THRESHOLD
  }

  // A1w／X2: only the message still waiting for a reply carries 已保存 (it reached the server).
  const awaitingReply = view.state === 'awaiting_tutor' || view.state === 'tutor_unavailable'
  const savedId = awaitingReply ? messages.filter(message => message.role === 'student').at(-1)?.id : undefined
  // X2, or a reply that never came (stale wait): retry in the conversation instead of thinking.
  const offerRetry = can(view, 'retry') && !retrying
  let studentIndex = 0
  // A3: earlier questions stay in the same conversation, collapsed to their confirmed viewpoint.
  const earlier = view.questions.filter(item => item.index < view.question_index)
  function confirmedCard(item: SoloQuestion) {
    if (!item.confirmed_summary) return null
    return <article key={`confirmed-${item.id}`} className="solo-confirmed">
      <strong><span aria-hidden="true">✓ </span>{t('review.confirmedCard', { number: item.index + 1, option: stanceLabel(item) ?? t('review.confirmedFallback') })}</strong>
      <p>{item.confirmed_summary.reason_summary}</p>
    </article>
  }

  return <section ref={timelineRef} className="solo-timeline" aria-label={t('timeline.label')} onScroll={trackScroll}>
    {earlier.map(confirmedCard)}
    {question && question.index > 0
      ? <>
        <article className="solo-scenario">
          <strong>{t('questionTitle', { number: question.index + 1, title: question.title })}</strong>
          <span>{t('next.teacherScenario')}</span>
          <p>{question.scenario}</p>
        </article>
        <article className="solo-message solo-message--tutor">
          <span className="solo-message__avatar" aria-hidden="true">{t('timeline.socratesMark')}</span>
          <div><strong>{t('timeline.socrates')}</strong><p>{t('next.intuition')}</p></div>
        </article>
      </>
      : <article className="solo-message solo-message--tutor">
        <span className="solo-message__avatar" aria-hidden="true">{t('timeline.socratesMark')}</span>
        <div><strong>{t('timeline.socrates')}</strong><p>{t('timeline.opening', { name: view.display_name })}</p></div>
      </article>}
    {messages.map(message => {
      if (message.role === 'student') studentIndex += 1
      if (message.role === 'tutor') return <article key={message.id} className="solo-message solo-message--tutor">
        <span className="solo-message__avatar" aria-hidden="true">{t('timeline.socratesMark')}</span>
        <div><strong>{t('timeline.socrates')}</strong><p>{message.text}</p></div>
      </article>
      // Design A1: the student's label sits above the bubble, outside it.
      return <article key={message.id} className="solo-message solo-message--student">
        <strong className="solo-message__label">{studentIndex === 1 ? t('timeline.meFirst') : t('timeline.me')}</strong>
        <div>
          <p>{message.text}</p>
          {message.id === savedId && <small>{t('timeline.saved')}</small>}
        </div>
      </article>
    })}
    {pendingStudent && <article className="solo-message solo-message--student">
      <strong className="solo-message__label">{pendingStudent.first ? t('timeline.meFirst') : t('timeline.me')}</strong>
      <div><p>{pendingStudent.text}</p></div>
    </article>}
    {/* X1: the summary the student called off, then Socrates asks which part (fixed copy). */}
    {view.revising && view.rejected_summary && question && <>
      <article className="solo-message solo-message--student solo-rejected">
        <div>
          <strong>{t('revise.echoTitle')}</strong>
          <p>{rejectedText(view.rejected_summary, stanceLabel(question), t)}</p>
        </div>
      </article>
      <article className="solo-message solo-message--tutor">
        <span className="solo-message__avatar" aria-hidden="true">{t('timeline.socratesMark')}</span>
        <div><strong>{t('timeline.socrates')}</strong><p>{t('revise.ask')}</p></div>
      </article>
    </>}
    {/* A3b／A3: the confirmed viewpoint closes this question's part of the conversation. */}
    {question && confirmedCard(question)}
    {view.state === 'reviewing' && <article className="solo-message solo-message--tutor">
      <span className="solo-message__avatar" aria-hidden="true">{t('timeline.socratesMark')}</span>
      <div><strong>{t('timeline.socrates')}</strong><p>{t('review.closing', { name: view.display_name })}</p></div>
    </article>}
    {/* X2: the failure sits in the conversation, right after the saved message it concerns. */}
    {offerRetry && <div className="solo-unavailable" role="status">
      <div>
        <strong>{view.notice === 'owner_provider_missing' ? t('unavailable.ownerMissing') : t('unavailable.title')}</strong>
        <p>{t('unavailable.saved')}</p>
      </div>
      <button className="solo-primary" type="button" onClick={() => onRetry?.()}>{t('unavailable.retry')}</button>
    </div>}
    {waiting && !offerRetry && <article className="solo-message solo-message--tutor" role="status">
      <span className="solo-message__avatar" aria-hidden="true">{t('timeline.socratesMark')}</span>
      <div><strong>{t('timeline.socrates')}</strong><p>{t('timeline.thinking')}</p></div>
    </article>}
  </section>
}

const SETTLED: ReadonlyArray<SoloAttemptView['state']> = ['confirming', 'between_questions', 'reviewing']

/** This question's messages. Once the backend decides to confirm (A2, and after it A3／A3b),
 * the tutor's reply to that turn is left out: its new question would ask the student two
 * things at once (the designs put the summary right after the student's last message). */
function withoutConfirmingFollowUp(view: SoloAttemptView) {
  const messages = view.messages.filter(message => message.question_index === view.question_index)
  const last = messages[messages.length - 1]
  if ((SETTLED.includes(view.state) || view.revising) && last?.role === 'tutor') return messages.slice(0, -1)
  return messages
}

type Summary = NonNullable<SoloAttemptView['rejected_summary']>

function rejectedText(summary: Summary, position: string | null, t: (key: string, options?: Record<string, unknown>) => string) {
  const parts = [
    position && t('revise.position', { value: position }),
    t('revise.reason', { value: summary.reason_summary }),
    summary.relevant_conditions.length > 0 && t('revise.conditions', { value: summary.relevant_conditions.join('；') }),
  ]
  return parts.filter(Boolean).join(t('revise.separator'))
}
