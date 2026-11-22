import { type ReactNode, useEffect, useState } from 'react'
import { useT } from '../../i18n/useT'
import type { SoloScenario } from './soloView'

type Props = {
  scenario: SoloScenario
  confirming?: boolean
  revising?: boolean
  progress?: ReactNode
  // Where voice mode puts its 蘇格拉底 card (Figma 749:324: under the scenario, in this column).
  voice?: ReactNode
}

export function ScenarioBoard({ scenario, confirming = false, revising = false, progress = null, voice = null }: Props) {
  const { t } = useT('solo')
  // A0m／A1m: on a phone the board is open for the first answer, then folds to its title so the
  // conversation has the room. Desktop always shows the text and hides the toggle (solo.css).
  const answered = Boolean(scenario.answer)
  const [open, setOpen] = useState(!answered)
  useEffect(() => { setOpen(!answered) }, [scenario.id, answered])
  return <aside className="solo-question">
    <section className="solo-question__board" aria-labelledby="solo-scenario-title">
      <div className="solo-question__head">
        <h1 id="solo-scenario-title">{t('scenarioTitle', { number: scenario.index + 1 })}</h1>
        <button
          className="solo-question__toggle"
          type="button"
          aria-expanded={open}
          aria-controls="solo-scenario-text"
          aria-label={t(open ? 'board.collapse' : 'board.expand')}
          onClick={() => setOpen(value => !value)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      </div>
      <p id="solo-scenario-text" className={`solo-question__scenario${open ? '' : ' solo-question__scenario--folded'}`}>{scenario.text}</p>
    </section>
    {!confirming && scenario.index === 0 && <p className="solo-question__source">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
      {t('teacherSource')}
    </p>}
    {voice}
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
