import type { ReactNode } from 'react'
import { useT } from '../../../i18n/useT'
import { StanceChip } from './StanceChip'
import { stanceLabel, type SoloQuestion } from './soloView'

export function QuestionBoard({ question, confirming = false, revising = false, progress = null }: { question: SoloQuestion; confirming?: boolean; revising?: boolean; progress?: ReactNode }) {
  const { t } = useT('solo')
  const selected = stanceLabel(question)
  return <aside className="solo-question">
    <section className="solo-question__board" aria-labelledby="solo-question-title">
      <h1 id="solo-question-title">{t('questionTitle', { number: question.index + 1, title: question.title })}</h1>
      <p className="solo-question__scenario">{question.scenario}</p>
    </section>
    {!confirming && <p className="solo-question__source">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
      {t('teacherSource')}
    </p>}
    <section className={`solo-choice ${selected ? '' : 'solo-choice--empty'}`} aria-label={t('myChoice')}>
      <div className="solo-choice__head"><h2>{t('myChoice')}</h2>{selected && <StanceChip question={question} />}</div>
      {selected && question.stance
        ? <p className="solo-choice__reason">{question.stance.reason}</p>
        : <p>{t('choicePending')}</p>}
    </section>
    {progress}
    <section className="solo-explainer">
      <h2>{revising ? t('revise.asideTitle') : confirming ? t('whyConfirmTitle') : t('aboutTitle')}</h2>
      <p>{revising ? t('revise.asideBody') : confirming ? t('whyConfirmBody') : t('aboutBody')}</p>
    </section>
  </aside>
}
