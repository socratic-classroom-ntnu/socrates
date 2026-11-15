import { useT } from '../../i18n/useT'
import type { SoloAttemptView } from './soloView'

const SCENARIO_NOTE = { goal_met: 'confirmed', capped: 'capped', in_progress: 'current' } as const

/** Left column: only the scenarios the student has reached; the next one is not known until it is given. */
export function SoloProgress({ view }: { view: SoloAttemptView }) {
  const { t } = useT('solo')
  return <section className="solo-progress-list" aria-label={t('next.progress')}>
    <h2>{t('next.progress')}</h2>
    <ol>
      {view.scenarios.map(scenario => <li key={scenario.id} aria-current={scenario.index === view.scenario_index ? 'step' : undefined}>
        <strong>{t('scenarioTitle', { number: scenario.index + 1 })}</strong>
        <span>{t(`next.${SCENARIO_NOTE[scenario.status]}`)}</span>
      </li>)}
    </ol>
  </section>
}
