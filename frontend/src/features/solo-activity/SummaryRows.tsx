import { useT } from '../../i18n/useT'
import type { SoloAttemptView } from './soloView'

type Summary = NonNullable<SoloAttemptView['candidate_summary']>

/** The three parts a student can call off (立場／理由／條件, the same as the 「哪裡不太對」 buttons), in
 * one order and one layout wherever a summary is shown: the card to confirm, the one they called off,
 * and the ones that close a scenario (fb005). */
export function SummaryRows({ summary }: { summary: Summary }) {
  const { t } = useT('solo')
  const blank = <span className="solo-viewpoint__blank">{t('viewpoint.blank')}</span>
  // Some models leave a part empty until the student has said something to summarise.
  return <dl className="solo-summary-rows">
    <div><dt>{t('viewpoint.position')}</dt><dd>{summary.current_position.trim() ? summary.current_position : blank}</dd></div>
    <div><dt>{t('viewpoint.reason')}</dt><dd>{summary.reason_summary.trim() ? summary.reason_summary : blank}</dd></div>
    {summary.relevant_conditions.length > 0 && <div>
      <dt>{t('viewpoint.conditions')}</dt>
      <dd><ul>{summary.relevant_conditions.map(condition => <li key={condition}>{condition}</li>)}</ul></dd>
    </div>}
  </dl>
}
