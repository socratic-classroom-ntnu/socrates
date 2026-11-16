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

  return <section className="solo-viewpoint" aria-labelledby="solo-viewpoint-title">
    <header>
      <span className="solo-message__avatar" aria-hidden="true">{t('timeline.socratesMark')}</span>
      <div>
        <h2 id="solo-viewpoint-title">{t(capped ? 'viewpoint.cappedTitle' : 'viewpoint.title')}</h2>
        <p>{t(capped ? 'viewpoint.cappedSubtitle' : 'viewpoint.subtitle')}</p>
      </div>
    </header>
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
}
