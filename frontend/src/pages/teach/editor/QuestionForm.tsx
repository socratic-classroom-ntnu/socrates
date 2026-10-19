import { useState } from 'react'
import { useT } from '../../../i18n/useT'
import { type ActivityForm, addOption, LIMITS, type Problem, type QuestionForm as Question, removeOption, removeQuestion, updateOption, updateQuestion } from './editorState'
import { LETTERS, locate } from './problemText'

type Props = {
  form: ActivityForm
  question: Question
  index: number
  locked: boolean
  problems: Problem[]
  onChange(form: ActivityForm): void
  collapsed: boolean
  onToggle(): void
}

/** The left-hand card for one question: title, scenario, 2–4 stances and the optional follow-up direction. */
export function QuestionForm({ form, question: q, index, locked, problems, onChange, collapsed, onToggle }: Props) {
  const { t } = useT('editor')
  const [followUpOpen, setFollowUpOpen] = useState(q.follow_up_direction.trim() !== '')
  const problemOf = (field: string) => problems.find(p => p.field === field)
  const messageOf = (field: string) => { const p = problemOf(field); return p ? locate(p, form, t).message : null }
  const optionProblem = q.options.some(o => problemOf(`q-${q.id}-opt-${o.id}`)) || problemOf(`q-${q.id}-options`)
  const name = t('sections.question', { n: index + 1 })
  const titleError = messageOf(`q-${q.id}-title`)
  const scenarioError = messageOf(`q-${q.id}-scenario`)

  return <section className="editor-card editor-card--question" aria-labelledby={`q-${q.id}-heading`}>
    <header className="editor-card__head">
      <h2 id={`q-${q.id}-heading`}>{name} <span className="editor-card__of">{t('sections.of', { total: form.questions.length })}</span></h2>
      {locked
        ? <span className="locked-badge">{t('locked.badge')}</span>
        : form.questions.length > 1 && <button type="button" className="editor-link editor-link--danger" onClick={() => onChange(removeQuestion(form, q.id))}>{t('fields.removeQuestion')}</button>}
      <button type="button" className="editor-card__toggle" aria-expanded={!collapsed} aria-label={collapsed ? t('sections.expand', { name }) : t('sections.collapse', { name })} onClick={onToggle}>⌄</button>
    </header>
    {!collapsed && <div className="editor-card__body">
      <div className={'form-field' + (titleError ? ' form-field--error' : '')}>
        <label htmlFor={`q-${q.id}-title`}>{t('fields.questionTitle')}<span className="form-field__star" aria-hidden="true"> *</span><span className="sr-only">{t('fields.required')}</span></label>
        <input id={`q-${q.id}-title`} value={q.title} maxLength={LIMITS.questionTitle} readOnly={locked}
          aria-invalid={titleError ? true : undefined} aria-describedby={titleError ? `q-${q.id}-title-error` : undefined}
          onChange={event => onChange(updateQuestion(form, q.id, { title: event.target.value }))} />
        {titleError && <p id={`q-${q.id}-title-error`} className="form-field__error">{titleError}</p>}
      </div>
      <div className={'form-field' + (scenarioError ? ' form-field--error' : '')}>
        <label htmlFor={`q-${q.id}-scenario`}>{t('fields.scenario')}<span className="form-field__star" aria-hidden="true"> *</span><span className="sr-only">{t('fields.required')}</span></label>
        <textarea id={`q-${q.id}-scenario`} rows={4} value={q.scenario} maxLength={LIMITS.scenario} readOnly={locked} placeholder={t('fields.scenarioPlaceholder')}
          aria-invalid={scenarioError ? true : undefined} aria-describedby={`q-${q.id}-scenario-hint`}
          onChange={event => onChange(updateQuestion(form, q.id, { scenario: event.target.value }))} />
        {scenarioError && <p className="form-field__error">{scenarioError}</p>}
        <p id={`q-${q.id}-scenario-hint`} className="form-field__hint">{t('fields.scenarioHint')}</p>
      </div>
      <fieldset className="editor-options">
        <legend>{t('fields.options')} <span className="editor-options__hint">{t('fields.optionsHint')}</span></legend>
        {q.options.map((o, i) => {
          const field = `q-${q.id}-opt-${o.id}`
          const invalid = Boolean(problemOf(field))
          return <div key={o.id} className="editor-option">
            <span className={`stance-chip stance-chip--${i}`} aria-hidden="true">{LETTERS[i]}</span>
            <input id={field} aria-label={t('fields.option', { letter: LETTERS[i] })} value={o.text} maxLength={LIMITS.option} readOnly={locked}
              aria-invalid={invalid ? true : undefined} className={invalid ? 'editor-option__input--error' : undefined}
              onChange={event => onChange(updateOption(form, q.id, o.id, event.target.value))} />
            {!locked && <button type="button" className="editor-option__remove" aria-label={t('fields.removeOption', { letter: LETTERS[i] })}
              disabled={q.options.length <= LIMITS.options[0]} onClick={() => onChange(removeOption(form, q.id, o.id))}>✕</button>}
          </div>
        })}
        {optionProblem && <p className="form-field__error">{t('errors.option')}</p>}
        {!locked && q.options.length < LIMITS.options[1] && <button type="button" className="editor-add-option" onClick={() => onChange(addOption(form, q.id))}>{t('fields.addOption')}</button>}
      </fieldset>
      <div className="editor-followup">
        <button type="button" className="editor-followup__toggle" aria-expanded={followUpOpen} onClick={() => setFollowUpOpen(open => !open)}>
          <span><strong>{t('fields.followUp')}</strong> <span className="editor-followup__optional">{t('fields.optional')}</span><span className="editor-followup__hint">{t('fields.followUpHint')}</span></span>
          <span aria-hidden="true">{followUpOpen ? '⌄' : '›'}</span>
        </button>
        {followUpOpen && <textarea id={`q-${q.id}-followup`} aria-label={t('fields.followUp')} rows={3} value={q.follow_up_direction} maxLength={LIMITS.followUp} readOnly={locked}
          onChange={event => onChange(updateQuestion(form, q.id, { follow_up_direction: event.target.value }))} />}
      </div>
    </div>}
  </section>
}
