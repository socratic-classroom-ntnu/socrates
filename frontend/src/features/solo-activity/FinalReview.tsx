import { useState } from 'react'
import { useT } from '../../i18n/useT'
import { ButtonLink } from '../../ui'
import { can, type SoloAction, type SoloAttemptView } from './soloView'

type FinalSummary = NonNullable<SoloAttemptView['final_summary']>
type Props = {
  view: SoloAttemptView
  pending: boolean
  perform(action: SoloAction, body?: Record<string, unknown>): Promise<boolean>
}

/** The review after the last scenario (O6): the final summary is written, then the student says
 * 對 or 不太對 with one sentence; a second 不太對 ends it as 未確認. Every button comes from
 * available_actions; the state only picks which part of the review is on screen. */
export function FinalReview({ view, pending, perform }: Props) {
  const summary = view.final_summary
  if (view.state === 'reflecting' && summary) return <FinalCheck view={view} summary={summary} pending={pending} perform={perform} />
  if (view.state === 'completed') return <FinalDone view={view} />
  return <FinalBar view={view} pending={pending} perform={perform} />
}

function FinalBar({ view, pending, perform }: Props) {
  const { t } = useT('solo')
  const writing = view.state === 'awaiting_reflection_prompt'
  const subtitle = writing
    ? t('final.writing')
    : view.notice === 'owner_provider_missing'
      ? t('final.ownerMissing')
      : view.notice ? t('final.failed') : t('review.subtitle')
  return <section className="solo-review" aria-labelledby="solo-review-title">
    <div>
      <h2 id="solo-review-title">{t('review.title')}</h2>
      <p role={writing || view.notice ? 'status' : undefined}>{subtitle}</p>
    </div>
    <div className="solo-review__action">
      {can(view, 'retry_reflection_prompt') && <button className="solo-review__start" type="button" disabled={pending} onClick={() => { void perform('retry_reflection_prompt') }}>
        {view.notice || writing ? t('final.retry') : t('final.write')} <span aria-hidden="true">→</span>
      </button>}
      {can(view, 'submit_review') && <button className="solo-review__skip" type="button" disabled={pending} onClick={() => { void perform('submit_review') }}>
        {t('final.finish')}
      </button>}
    </div>
  </section>
}

function FinalCheck({ view, summary, pending, perform }: Props & { summary: FinalSummary }) {
  const { t } = useT('solo')
  const [revising, setRevising] = useState(false)
  const [text, setText] = useState('')
  const sentence = text.trim()

  async function sendRevision() {
    if (!sentence) return
    if (await perform('continue_reflection', { text: sentence })) {
      setRevising(false)
      setText('')
    }
  }

  return <section className="solo-viewpoint solo-final" aria-labelledby="solo-final-title">
    <header>
      <span className="solo-message__avatar" aria-hidden="true">{t('timeline.socratesMark')}</span>
      <div>
        <h2 id="solo-final-title">{t('final.title')}</h2>
        <p>{t('final.subtitle')}</p>
      </div>
    </header>
    <Feedback view={view} />
    <SummaryBody summary={summary} />
    {revising
      ? <form className="solo-final__revise" onSubmit={event => { event.preventDefault(); void sendRevision() }}>
        <label htmlFor="solo-final-revise">{t('final.reviseLabel')}</label>
        <textarea
          id="solo-final-revise"
          value={text}
          maxLength={4000}
          placeholder={t('final.revisePlaceholder')}
          disabled={pending}
          onChange={event => setText(event.target.value)}
        />
        {view.final_revised && <p className="solo-final__last">{t('final.lastChance')}</p>}
        <div className="solo-viewpoint__actions">
          <button className="solo-secondary" type="button" disabled={pending} onClick={() => setRevising(false)}>{t('final.reviseCancel')}</button>
          <button className="solo-primary" type="submit" disabled={pending || !sentence}>
            {t(view.final_revised ? 'final.reviseEnd' : 'final.reviseSend')}
          </button>
        </div>
      </form>
      : <div className="solo-viewpoint__actions">
        {can(view, 'submit_reflection') && <button className="solo-primary" type="button" disabled={pending || !view.final_digest} onClick={() => { void perform('submit_reflection', { summary_digest: view.final_digest }) }}>
          {t('final.confirm')}
        </button>}
        {can(view, 'continue_reflection') && <button className="solo-secondary" type="button" disabled={pending} onClick={() => setRevising(true)}>
          {t('final.revise')}
        </button>}
      </div>}
  </section>
}

function FinalDone({ view }: { view: SoloAttemptView }) {
  const { t } = useT('solo')
  const summary = view.final_summary
  return <section className="solo-viewpoint solo-final" aria-labelledby="solo-final-title">
    <header>
      <span className="solo-message__avatar" aria-hidden="true">{t('timeline.socratesMark')}</span>
      <div>
        <h2 id="solo-final-title">{summary ? t('final.doneTitle') : t('final.doneNoSummary')}</h2>
        {view.final_status && <p className={`solo-final__status solo-final__status--${view.final_status}`}>
          {t(view.final_status === 'confirmed' ? 'final.confirmed' : 'final.unconfirmed')}
        </p>}
      </div>
    </header>
    <Feedback view={view} />
    {summary && <SummaryBody summary={summary} />}
    <div className="solo-viewpoint__actions">
      <ButtonLink variant="outline" to={`/learn/activities/${view.activity_id}`}>{t('final.back')}</ButtonLink>
    </div>
  </section>
}

/** What the student said was off (不太對), shown in the review rather than in a scenario's dialogue. */
function Feedback({ view }: { view: SoloAttemptView }) {
  const { t } = useT('solo')
  const said = view.messages.filter(message => message.final_feedback)
  if (said.length === 0) return null
  return <ul className="solo-final__feedback" aria-label={t('final.feedbackLabel')}>
    {said.map(message => <li key={message.id}>{t('final.feedback', { text: message.text })}</li>)}
  </ul>
}

function Quotes({ sources }: { sources: FinalSummary['points'][number]['sources'] }) {
  const { t } = useT('solo')
  if (sources.length === 0) return null
  return <ul className="solo-final__quotes">
    {sources.map(source => <li key={`${source.message_id}:${source.start}`}>{t('final.quote', { quote: source.quote })}</li>)}
  </ul>
}

function SummaryBody({ summary }: { summary: FinalSummary }) {
  const { t } = useT('solo')
  return <dl>
    <div><dt>{t('final.points')}</dt><dd><ul>
      {summary.points.map((point, index) => <li key={index}>{point.text}<Quotes sources={point.sources} /></li>)}
    </ul></dd></div>
    <div><dt>{t('final.trajectory')}</dt><dd><ol className="solo-final__trajectory">
      {summary.trajectory.map((step, index) => <li key={index}>
        <strong>{t('final.step', { number: index + 1 })}</strong> {step.position}
        {step.shift_reason && <p>{t('final.shift', { reason: step.shift_reason })}</p>}
        <Quotes sources={step.sources} />
      </li>)}
    </ol></dd></div>
    <div><dt>{t('final.position')}</dt><dd>{summary.final_position}</dd></div>
    <div><dt>{t('final.style')}</dt><dd>{summary.reasoning_style}</dd></div>
    {summary.open_question && <div><dt>{t('final.question')}</dt><dd>{summary.open_question}</dd></div>}
  </dl>
}
