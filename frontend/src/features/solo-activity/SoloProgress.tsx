import { useT } from '../../i18n/useT'
import type { SoloAttemptView } from './soloView'

/** Left column: only the scenarios the student has reached; the next one is not known until it is given. */
export function SoloProgress({ view }: { view: SoloAttemptView }) {
  const { t } = useT('solo')
  return <section className="solo-progress-list" aria-label={t('next.progress')}>
    <h2>{t('next.progress')}</h2>
    <ol>
      {view.scenarios.map(scenario => <li key={scenario.id} aria-current={scenario.index === view.scenario_index ? 'step' : undefined}>
        <strong>{t('scenarioTitle', { number: scenario.index + 1 })}</strong>
        <span>{scenario.status === 'goal_met' ? t('next.confirmed') : t('next.current')}</span>
      </li>)}
    </ol>
  </section>
}
