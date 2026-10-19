import { useT } from '../../../i18n/useT'
import type { ActivityForm, Problem } from './editorState'
import { locate } from './problemText'

/** T3E: every gap at the top; selecting one jumps to its field. */
export function ErrorSummary({ problems, form, onJump }: { problems: Problem[]; form: ActivityForm; onJump(problem: Problem): void }) {
  const { t } = useT('editor')
  return <section role="alert" className="error-summary">
    <h2>{t('errors.summaryTitle', { count: problems.length })}</h2>
    <p>{t('errors.summaryBody')}</p>
    <ul>
      {problems.map(problem => {
        const place = locate(problem, form, t)
        return <li key={problem.field + problem.kind}>
          <button type="button" onClick={() => onJump(problem)}>
            <span className="error-summary__where">{t('errors.summaryItem', { where: place.where, field: place.field })}</span> {place.state}
          </button>
        </li>
      })}
    </ul>
  </section>
}
