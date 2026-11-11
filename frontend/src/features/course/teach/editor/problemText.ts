import type { Problem } from './editorState'

type Translate = (key: string, options?: Record<string, unknown>) => string

export type Located = { section: 'basics'; where: string; field: string; state: string; message: string }

/** Where a problem lives and how to say it, for both the summary (T3E) and the field itself. */
export function locate(problem: Problem, t: Translate): Located {
  const basics = t('sections.basics')
  if (problem.field === 'title') return { section: 'basics', where: basics, field: t('fields.title'), state: t('errors.missing'), message: t('errors.title') }
  if (problem.field === 'start') {
    const past = problem.kind === 'startPast'
    return { section: 'basics', where: basics, field: t('fields.start'), state: past ? t('errors.past') : t('errors.missing'), message: past ? t('errors.startPast') : t('errors.start') }
  }
  const state = problem.kind === 'endBeforeStart' ? t('errors.beforeStart') : problem.kind === 'endPast' ? t('errors.past') : t('errors.missing')
  const message = problem.kind === 'endBeforeStart' ? t('errors.endBeforeStart') : problem.kind === 'endPast' ? t('errors.endPast') : t('errors.end')
  return { section: 'basics', where: basics, field: t('fields.end'), state, message }
}
