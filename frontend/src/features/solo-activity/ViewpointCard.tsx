import { useT } from '../../i18n/useT'
import { can, currentScenario, principleKey, type SoloAttemptView } from './soloView'

type Props = {
  view: SoloAttemptView
  pending: boolean
  onConfirm(): Promise<void>
  onRevise(): Promise<void>
}

export function ViewpointCard({ view, pending, onConfirm, onRevise }: Props) {
  const { t } = useT('solo')
  const summary = view.candidate_summary
  if (!summary) return null

  const key = principleKey(view.principle_hint)
  const principle = key ? t(`viewpoint.principles.${key}`) : null
  // Wording only: the buttons still come from available_actions. A capped scenario is never saved as
  // the student's confirmed view, so the card must not ask them to say it is.
  const capped = currentScenario(view)?.status === 'capped'

  // Design A2: Socrates asks in the conversation, like any other turn; the card under it holds only
  // the summary and is named by that question.
  return <>
    <article className="solo-message solo-message--tutor solo-viewpoint__ask">
      <span className="solo-message__avatar" aria-hidden="true">{t('timeline.socratesMark')}</span>
      <div>
        <strong>{t('timeline.socrates')}</strong>
        <p id="solo-viewpoint-title">{t(capped ? 'viewpoint.cappedTitle' : 'viewpoint.title')}</p>
      </div>
    </article>
    <section className="solo-viewpoint" aria-labelledby="solo-viewpoint-title">
      <dl>
        <div><dt>{t('viewpoint.reason')}</dt><dd>{summary.reason_summary}</dd></div>
        {summary.relevant_conditions.length > 0 && <div>
          <dt>{t('viewpoint.conditions')}</dt>
          <dd><ul>{summary.relevant_conditions.map(condition => <li key={condition}>{condition}</li>)}</ul></dd>
        </div>}
      </dl>
      {principle && <div className="solo-viewpoint__principle">
        <strong>{t('viewpoint.principle', { principle })}</strong>
        {summary.principle_note && <p>{summary.principle_note}</p>}
        <small>{t('viewpoint.principleNote')}</small>
      </div>}
      <div className="solo-viewpoint__actions">
        {can(view, 'confirm_viewpoint') && <button className="solo-primary" type="button" disabled={pending || !view.summary_digest} onClick={() => { void onConfirm() }}>
          {t(capped ? 'viewpoint.cappedConfirm' : 'viewpoint.confirm')}
        </button>}
        {can(view, 'revise_viewpoint') && <button className="solo-secondary" type="button" disabled={pending} onClick={() => { void onRevise() }}>
          {t('viewpoint.revise')}
        </button>}
      </div>
    </section>
  </>
}
