import { useT } from '../../../../i18n/useT'
import type { Attempt, FinalSummary, Summary } from './transcriptModel'
import { finalFeedback } from './transcriptModel'
import { scenarioName } from './transcriptModel'

/** Grey words in place of a field the student has not written yet (some models leave it empty). */
export function Written({ text }: { text: string }) {
  const { t } = useT('teach')
  return text.trim() ? <>{text}</> : <span className="tc-blank">{t('transcript.blank')}</span>
}

/** The summary waiting for the student's 對／不太對 (Figma 06, 07); nothing here is confirmed yet. */
export function PendingSummary({ summary, scenarioNumber }: { summary: Summary; scenarioNumber: number }) {
  const { t } = useT('teach')
  return <section className="tc-card" aria-label={t('transcript.summary.title')}>
    <header className="tc-card__head">
      <h3>{t('transcript.summary.title')}</h3>
      <span className="tc-tag tc-tag--warn">{t('transcript.summary.pending')}</span>
    </header>
    <p className="tc-card__caption">{t('transcript.summary.caption', { number: scenarioNumber })}</p>
    <dl className="tc-rows">
      <div><dt>{t('transcript.summary.position')}</dt><dd><span className="tc-chip"><Written text={summary.current_position} /></span></dd></div>
      <div><dt>{t('transcript.summary.reason')}</dt><dd><Written text={summary.reason_summary} /></dd></div>
      {summary.relevant_conditions.length > 0 && <div><dt>{t('transcript.summary.conditions')}</dt><dd>{summary.relevant_conditions.join(t('transcript.summary.conditionsJoin'))}</dd></div>}
      {summary.unresolved_issue.trim() !== '' && <div><dt>{t('transcript.summary.unresolved')}</dt><dd>{summary.unresolved_issue}</dd></div>}
      {summary.principle_note.trim() !== '' && <div><dt>{t('transcript.summary.principle')}</dt><dd>{summary.principle_note}</dd></div>}
    </dl>
  </section>
}

function FinalCard({ summary, confirmed }: { summary: FinalSummary; confirmed: boolean }) {
  const { t } = useT('teach')
  return <section className="tc-card" aria-label={t('transcript.review.finalTitle')}>
    <header className="tc-card__head">
      <h3>{t('transcript.review.finalTitle')}</h3>
      <span className={`tc-tag ${confirmed ? 'tc-tag--ok' : 'tc-tag--warn'}`}>{confirmed ? `✓ ${t('transcript.review.confirmed')}` : t('transcript.review.pending')}</span>
    </header>
    <dl className="tc-stack">
      <div><dt>{t('transcript.review.finalPosition')}</dt><dd><Written text={summary.final_position} /></dd></div>
      {summary.trajectory.length > 0 && <div><dt>{t('transcript.review.trajectory')}</dt><dd>
        {summary.trajectory.map((step, index) => <p key={index}>
          {t('transcript.review.step', { label: t('transcript.scenarioLabel', { number: index + 1 }), position: step.position })}
          {step.shift_reason.trim() !== '' && t('transcript.review.shift', { reason: step.shift_reason })}
        </p>)}
      </dd></div>}
      <div><dt>{t('transcript.review.style')}</dt><dd><Written text={summary.reasoning_style} /></dd></div>
      {summary.points.length > 0 && <div><dt>{t('transcript.review.points')}</dt><dd>{summary.points.map((point, index) => <p key={index}>{point.text}</p>)}</dd></div>}
      {summary.open_question.trim() !== '' && <div><dt>{t('transcript.review.open')}</dt><dd>{summary.open_question}</dd></div>}
    </dl>
  </section>
}

/** After the last scenario: the final summary, or for 未確認結束 only what was confirmed and what the student wrote (Figma 05, 08). */
export function ReviewSection({ attempt }: { attempt: Attempt }) {
  const { t } = useT('teach')
  const unconfirmed = attempt.state === 'completed' && attempt.final_status === 'unconfirmed'
  const confirmed = attempt.state === 'completed' && attempt.final_status === 'confirmed'

  if (unconfirmed) {
    const sentences = finalFeedback(attempt)
    return <section className="tc-review" aria-label={t('transcript.review.title')}>
      <h2>{t('transcript.review.unconfirmedTitle')}</h2>
      <div className="tc-grid">
        {attempt.scenarios.filter(scenario => scenario.confirmed_summary).map(scenario => <article key={scenario.id} className="tc-card tc-card--small">
          <h3>{t('transcript.scenarioNamed', { number: scenario.index + 1, name: scenarioName(scenario.text) })}</h3>
          <span className="tc-tag tc-tag--ok">✓ {t('transcript.review.confirmed')}</span>
          <p className="tc-card__strong"><Written text={scenario.confirmed_summary?.current_position ?? ''} /></p>
          <p><Written text={scenario.confirmed_summary?.reason_summary ?? ''} /></p>
        </article>)}
      </div>
      <section className="tc-card" aria-label={t('transcript.review.crossTitle')}>
        <h3>{t('transcript.review.crossTitle')}</h3>
        <p className="tc-card__caption">{t('transcript.review.crossIntro')}</p>
        {sentences.map((sentence, index) => <p key={sentence.id} className="tc-quote">{t('transcript.review.attempt', { number: index + 1, text: sentence.text })}</p>)}
        <div className="tc-note tc-note--warn"><strong>{t('transcript.review.notice')}</strong><p>{t('transcript.review.noticeBody')}</p></div>
      </section>
    </section>
  }

  return <section className="tc-review" aria-label={t('transcript.review.title')}>
    <h2>{t('transcript.review.title')}</h2>
    {attempt.final_summary
      ? <FinalCard summary={attempt.final_summary} confirmed={confirmed} />
      : <p className="tc-card__caption">{t(attempt.state === 'completed' ? 'transcript.review.noSummary' : 'transcript.review.inProgress')}</p>}
  </section>
}
