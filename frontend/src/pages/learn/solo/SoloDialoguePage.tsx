import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../../../api/classroomClient'
import { useResource } from '../../../api/useResource'
import { errorMessage } from '../../../i18n/errors'
import { useT } from '../../../i18n/useT'
import '../../../styles/solo.css'
import { QuestionBoard } from './QuestionBoard'
import { ReviewPlaceholder } from './ReviewPlaceholder'
import { SoloComposer } from './SoloComposer'
import { SoloProgress } from './SoloProgress'
import { SoloTimeline } from './SoloTimeline'
import { StanceForm } from './StanceForm'
import { can, type SoloAction, type SoloActivityView, type SoloAttemptView } from './soloView'
import { ViewpointCard } from './ViewpointCard'

const SAVE_CHECK_MS = 1000

export function SoloDialoguePage() {
  const { t } = useT('solo')
  const { activityId = '' } = useParams()
  const activity = useResource<SoloActivityView>(`/solo/activities/${activityId}`)
  const attemptId = activity.data?.attempt?.id ?? null
  const attempt = useResource<SoloAttemptView>(attemptId ? `/solo/attempts/${attemptId}` : null)
  const [view, setView] = useState<SoloAttemptView | null>(null)
  const [actionError, setActionError] = useState<unknown>(null)
  const [pendingStudent, setPendingStudent] = useState<{ text: string; first: boolean } | null>(null)
  const [pendingAction, setPendingAction] = useState<SoloAction | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  // Set once a read shows the sent message already stored, while the reply is still pending.
  const [savedEarly, setSavedEarly] = useState(false)
  const sendInFlight = useRef(false)
  useEffect(() => { if (attempt.data) setView(attempt.data) }, [attempt.data])
  useEffect(() => {
    if (!view || view.state !== 'awaiting_tutor' || pendingAction) return
    const timer = window.setInterval(() => { void attempt.reload() }, 3000)
    return () => window.clearInterval(timer)
  }, [attempt, pendingAction, view])

  if (activity.loading && !activity.data) return <main className="solo-dialogue" aria-busy="true" />
  if (activity.data && !activity.data.attempt) return <Navigate to={`/learn/activities/${activityId}`} replace />
  if (!activity.data || (attempt.loading && !view)) return <main className="solo-dialogue" aria-busy="true" />
  if (!view) return <main className="solo-dialogue solo-dialogue--message"><p>{errorMessage(t, attempt.error, 'solo')}</p></main>

  const question = view.questions.find(item => item.index === view.question_index)
  if (!question) return <main className="solo-dialogue solo-dialogue--message"><p>{t('questionUnavailable')}</p></main>

  async function perform(action: SoloAction, body?: Record<string, unknown>) {
    setActionError(null)
    setStatusMessage(null)
    setPendingAction(action)
    try {
      const next = await api(`/solo/attempts/${view!.id}/${action}`, 'POST', body) as SoloAttemptView
      setView(next)
      return true
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.detail === 'SOLO_ACTION_UNAVAILABLE') {
        await attempt.reload()
        setStatusMessage(t('statusUpdated'))
      } else if (!(error instanceof ApiError) || error.status === 0) {
        setActionError(error)
        await attempt.reload()
        setStatusMessage(t('statusUpdated'))
      } else {
        setActionError(error)
      }
      return false
    } finally {
      setPendingAction(null)
    }
  }

  /** The backend stores the student's message before it calls the tutor, in the same request.
   * Read the attempt once while that request is still open: if the message is there, show it
   * as saved (A1w) instead of "sending". */
  async function confirmSaved(before: number) {
    try {
      const current = await api(`/solo/attempts/${view!.id}`) as SoloAttemptView
      if (!sendInFlight.current) return
      if (current.state === 'awaiting_tutor' && current.messages.length > before) {
        setView(current)
        setPendingStudent(null)
        setSavedEarly(true)
      }
    } catch {
      // The send itself reports what went wrong.
    }
  }

  async function sendWithSaveCheck(action: SoloAction, body: Record<string, unknown>, pending: { text: string; first: boolean }) {
    setPendingStudent(pending)
    sendInFlight.current = true
    const timer = window.setTimeout(() => { void confirmSaved(view!.messages.length) }, SAVE_CHECK_MS)
    try {
      return await perform(action, body)
    } finally {
      window.clearTimeout(timer)
      sendInFlight.current = false
      setSavedEarly(false)
      setPendingStudent(null)
    }
  }

  async function sendMessage(text: string) {
    return sendWithSaveCheck('send_message', { text }, { text, first: false })
  }

  async function submitStance(optionId: string, reason: string) {
    return sendWithSaveCheck('submit_stance', { option_id: optionId, reason }, { text: reason, first: true })
  }

  const waiting = view.state === 'awaiting_tutor'
    || pendingAction === 'submit_stance'
    || pendingAction === 'send_message'
    || pendingAction === 'retry'

  return <main className="solo-dialogue">
    <header className="solo-dialogue__topbar">
      <Link className="solo-dialogue__brand" to={`/learn/activities/${activityId}`} aria-label={t('dialogue.back')}>
        <span aria-hidden="true">{t('dialogue.logo')}</span>
      </Link>
      <div className="solo-dialogue__course">
        <strong>{view.course_name} · {view.activity_title}</strong>
        <span>{t('dialogue.subtitle')}</span>
      </div>
      <span className="solo-dialogue__count">{t('dialogue.count', { current: view.question_index + 1, count: view.question_count })}</span>
      <span className="solo-dialogue__person" aria-label={view.display_name}>{view.display_name.slice(0, 1)}</span>
    </header>
    <div className="solo-dialogue__columns">
      <QuestionBoard
        question={question}
        confirming={can(view, 'confirm_viewpoint') || can(view, 'revise_viewpoint')}
        revising={view.revising}
        progress={view.question_count > 1 ? <SoloProgress view={view} /> : null}
      />
      <section className="solo-conversation">
        {view.state === 'reviewing'
          ? <>
            <SoloTimeline view={view} />
            <ReviewPlaceholder view={view} />
          </>
          : <>
            <SoloTimeline
              view={view}
              pendingStudent={pendingStudent}
              waiting={waiting}
              retrying={pendingAction === 'retry'}
              onRetry={() => { void perform('retry') }}
            />
            <StanceForm
              key={`stance-${view.id}-${question.index}`}
              view={view}
              question={question}
              onSubmit={submitStance}
            />
            <SoloComposer
              key={`composer-${view.id}-${question.index}`}
              view={view}
              pending={pendingAction !== null}
              sending={pendingAction === 'send_message' && !savedEarly}
              onSend={sendMessage}
            />
            {can(view, 'next_question') && <div className="solo-next">
              <button className="solo-primary" type="button" disabled={pendingAction !== null} onClick={() => { void perform('next_question') }}>
                {t('next.button')} <span aria-hidden="true">→</span>
              </button>
            </div>}
            <ViewpointCard
              view={view}
              question={question}
              pending={pendingAction !== null}
              onConfirm={async () => {
                if (view.summary_digest) await perform('confirm_viewpoint', { summary_digest: view.summary_digest })
              }}
              onRevise={async () => { await perform('revise_viewpoint') }}
            />
          </>}
        {statusMessage && <p className="solo-action-status" role="status">{statusMessage}</p>}
        {actionError && <p className="solo-action-error" role="alert">{errorMessage(t, actionError, 'solo')}</p>}
      </section>
    </div>
  </main>
}
