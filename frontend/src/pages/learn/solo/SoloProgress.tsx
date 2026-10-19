import { useT } from '../../../i18n/useT'
import { stanceLabel, type SoloAttemptView } from './soloView'

/** A3 left column: every question by number; only reached ones show their title (AGENTS.md:
 * 未進入的階段不回傳 title — the view does not even have it). */
export function SoloProgress({ view }: { view: SoloAttemptView }) {
  const { t } = useT('solo')
  const numbers = Array.from({ length: view.question_count }, (_, index) => index)
  return <section className="solo-progress-list" aria-label={t('next.progress')}>
    <h2>{t('next.progress')}</h2>
    <ol>
      {numbers.map(index => {
        const question = view.questions.find(item => item.index === index)
        const status = !question
          ? t('next.notStarted')
          : question.status === 'goal_met'
            ? t('next.confirmed', { option: stanceLabel(question) ?? t('review.confirmedFallback') })
            : t('next.current')
        return <li key={index} aria-current={index === view.question_index ? 'step' : undefined}>
          <strong>{question ? t('questionTitle', { number: index + 1, title: question.title }) : t('activity.questionNumber', { number: index + 1 })}</strong>
          <span>{status}</span>
        </li>
      })}
    </ol>
  </section>
}
