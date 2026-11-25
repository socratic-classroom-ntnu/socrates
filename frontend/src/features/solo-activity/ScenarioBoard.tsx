import { type ReactNode, useEffect, useState } from 'react'
import { useT } from '../../i18n/useT'
import type { SoloScenario } from './soloView'

type Props = {
  scenario: SoloScenario
  progress?: ReactNode
}

// fb002: the column holds the scenario, the answer and the progress only; the notes explaining what
// the page does (who wrote the scenario, what the dialogue is for, why confirm) are gone.
export function ScenarioBoard({ scenario, progress = null }: Props) {
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
    {scenario.answer && <section className="solo-choice" aria-label={t('myAnswer')}>
      <div className="solo-choice__head"><h2>{t('myAnswer')}</h2></div>
      <p className="solo-choice__reason">{scenario.answer}</p>
    </section>}
    {progress}
  </aside>
}
