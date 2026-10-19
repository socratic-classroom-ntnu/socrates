import type { ActivityForm, Problem } from './editorState'

type Translate = (key: string, options?: Record<string, unknown>) => string
export const LETTERS = ['A', 'B', 'C', 'D']

export type Located = { section: 'basics' | 'direction' | 'question'; questionId?: string; where: string; field: string; state: string; message: string }

/** Where a problem lives and how to say it, for both the summary (T3E) and the field itself. */
export function locate(problem: Problem, form: ActivityForm, t: Translate): Located {
  const basics = t('sections.basics')
  if (problem.field === 'title') return { section: 'basics', where: basics, field: t('fields.title'), state: t('errors.missing'), message: t('errors.title') }
  if (problem.field === 'start') {
    const past = problem.kind === 'startPast'
    return { section: 'basics', where: basics, field: t('fields.start'), state: past ? t('errors.past') : t('errors.missing'), message: past ? t('errors.startPast') : t('errors.start') }
  }
  if (problem.field === 'end') {
    const state = problem.kind === 'endBeforeStart' ? t('errors.beforeStart') : problem.kind === 'endPast' ? t('errors.past') : t('errors.missing')
    const message = problem.kind === 'endBeforeStart' ? t('errors.endBeforeStart') : problem.kind === 'endPast' ? t('errors.endPast') : t('errors.end')
    return { section: 'basics', where: basics, field: t('fields.end'), state, message }
  }
  if (problem.field === 'topic_direction') return { section: 'direction', where: t('sections.direction'), field: t('fields.topic'), state: t('errors.missing'), message: t('errors.topic_direction') }
  const index = form.questions.findIndex(q => q.id === problem.questionId)
  const q = form.questions[index]
  const where = q && q.title.trim() ? t('errors.questionLabelNamed', { n: index + 1, title: q.title.trim() }) : t('errors.questionLabel', { n: index + 1 })
  const base = { section: 'question' as const, questionId: problem.questionId, where }
  if (problem.field.endsWith('-title')) return { ...base, field: t('fields.questionTitle'), state: t('errors.empty'), message: t('errors.questionTitle') }
  if (problem.field.endsWith('-scenario')) return { ...base, field: t('fields.scenario'), state: t('errors.empty'), message: t('errors.scenario') }
  if (problem.kind === 'optionsMin') return { ...base, field: t('fields.options'), state: t('errors.optionsMin'), message: t('errors.optionsMin') }
  const option = q?.options.findIndex(o => problem.field === `q-${q.id}-opt-${o.id}`) ?? -1
  return { ...base, field: t('fields.option', { letter: LETTERS[option] ?? '?' }), state: t('errors.emptyOption'), message: t('errors.option') }
}
