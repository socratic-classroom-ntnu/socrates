import type { ReactNode } from 'react'
import { useT } from '../../i18n/useT'
import type { SoloScenario } from './soloView'

type Props = {
  scenario: SoloScenario
  confirming?: boolean
  revising?: boolean
  progress?: ReactNode
}

export function ScenarioBoard({ scenario, confirming = false, revising = false, progress = null }: Props) {
  const { t } = useT('solo')
  return <aside className="solo-question">
    <section className="solo-question__board" aria-labelledby="solo-scenario-title">
      <h1 id="solo-scenario-title">{t('scenarioTitle', { number: scenario.index + 1 })}</h1>
      <p className="solo-question__scenario">{scenario.text}</p>
    </section>
    {!confirming && scenario.index === 0 && <p className="solo-question__source">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
      {t('teacherSource')}
    </p>}
    <section className={`solo-choice ${scenario.answer ? '' : 'solo-choice--empty'}`} aria-label={t('myAnswer')}>
      <div className="solo-choice__head"><h2>{t('myAnswer')}</h2></div>
      {scenario.answer
        ? <p className="solo-choice__reason">{scenario.answer}</p>
        : <p>{t('answerPending')}</p>}
    </section>
    {progress}
    <section className="solo-explainer">
      <h2>{revising ? t('revise.asideTitle') : confirming ? t('whyConfirmTitle') : t('aboutTitle')}</h2>
      <p>{revising ? t('revise.asideBody') : confirming ? t('whyConfirmBody') : t('aboutBody')}</p>
    </section>
  </aside>
}
