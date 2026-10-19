import { useT } from '../../../i18n/useT'
import { StanceChip } from './StanceChip'
import { can, principleKey, stanceLabel, type SoloAttemptView, type SoloQuestion } from './soloView'

type Props = {
  view: SoloAttemptView
  question: SoloQuestion
  pending: boolean
  onConfirm(): Promise<void>
  onRevise(): Promise<void>
}

export function ViewpointCard({ view, question, pending, onConfirm, onRevise }: Props) {
  const { t } = useT('solo')
  const summary = view.candidate_summary
  if (!summary) return null

  const position = stanceLabel(question)
  const key = principleKey(view.principle_hint)
  const principle = key ? t(`viewpoint.principles.${key}`) : null

  return <section className="solo-viewpoint" aria-labelledby="solo-viewpoint-title">
    <header>
      <span className="solo-message__avatar" aria-hidden="true">{t('timeline.socratesMark')}</span>
      <div>
        <h2 id="solo-viewpoint-title">{t('viewpoint.title')}</h2>
        <p>{t('viewpoint.subtitle')}</p>
      </div>
    </header>
    <dl>
      {position && <div><dt>{t('viewpoint.position')}</dt><dd><StanceChip question={question} /></dd></div>}
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
        {t('viewpoint.confirm')}
      </button>}
      {can(view, 'revise_viewpoint') && <button className="solo-secondary" type="button" disabled={pending} onClick={() => { void onRevise() }}>
        {t('viewpoint.revise')}
      </button>}
    </div>
  </section>
}
