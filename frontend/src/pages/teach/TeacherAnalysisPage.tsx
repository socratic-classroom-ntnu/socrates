import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { components } from '../../api/classroomTypes'
import { useResource } from '../../api/useResource'
import { errorMessage } from '../../i18n/errors'
import { useT } from '../../i18n/useT'
import { optionLetter } from '../learn/solo/soloView'
import '../../styles/teach.css'
import '../../styles/teacher-live.css'
import '../../styles/teacher-analysis.css'
import { ActivityPageHeader } from './ActivityPageHeader'
import { ANALYSIS_DEMO, ANALYSIS_SOURCE } from './analysisDemo'

type Analysis = components['schemas']['SoloActivityAnalysisView']
type Progress = components['schemas']['SoloActivityProgressView']
type Question = components['schemas']['SoloAnalysisQuestionView']
type Option = components['schemas']['SoloAnalysisOptionView']

function percent(count: number, confirmed: number) {
  return confirmed <= 0 ? 0 : Math.round((count / confirmed) * 100)
}

export function TeacherAnalysisPage({ source = ANALYSIS_SOURCE }: { source?: 'api' | 'demo' }) {
  const { activityId } = useParams()
  const { t } = useT('teach')
  const analysis = useResource<Analysis>(source === 'api' && activityId ? `/solo/activities/${activityId}/analysis` : null)
  const progress = useResource<Progress>(source === 'demo' && activityId ? `/solo/activities/${activityId}/progress` : null)
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [showAll, setShowAll] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    const timer = window.setInterval(() => { void (source === 'api' ? analysis.reload() : progress.reload()) }, 10_000)
    return () => window.clearInterval(timer)
  }, [analysis.reload, progress.reload, source])

  const view = useMemo<Analysis | null>(() => {
    if (source === 'api') return analysis.data
    if (!progress.data) return null
    return {
      ...ANALYSIS_DEMO,
      activity_id: progress.data.activity_id,
      title: progress.data.title,
      course_id: progress.data.course_id,
      course_name: progress.data.course_name,
      status: progress.data.status,
      question_count: progress.data.question_count,
      ends_at: progress.data.ends_at,
      generated_at: progress.data.generated_at,
    }
  }, [analysis.data, progress.data, source])

  const resource = source === 'api' ? analysis : progress
  if (resource.loading && !view) return <div aria-busy="true" />
  if (!view) return <main className="teach-page teach-page--message"><p role="alert" className="form-error">{errorMessage(t, resource.error)}</p></main>

  const selected = view.questions.find(question => question.question_id === selectedQuestionId) ?? view.questions[0]
  const notStarted = Math.max(0, view.summary.enrolled - view.summary.started)

  function chooseQuestion(question: Question) {
    setSelectedQuestionId(question.question_id)
    setExpanded(new Set())
    setShowAll(new Set())
  }

  function toggleOption(optionId: string) {
    setExpanded(current => {
      const next = new Set(current)
      if (next.has(optionId)) next.delete(optionId); else next.add(optionId)
      return next
    })
  }

  return <main className="teach-page teacher-live teacher-analysis" data-testid="teacher-analysis-page">
    <ActivityPageHeader activity={view} current="analysis" onEnded={resource.reload} />

    {source === 'demo' && <p className="analysis-demo-banner" role="status">{t('analysis.demoBanner')}</p>}

    <section className="analysis-overview" aria-label={t('analysis.overview')}>
      <article className="analysis-overview__card">
        <strong>{t('analysis.started', { started: view.summary.started, enrolled: view.summary.enrolled })}</strong>
        <span>{t('analysis.notStarted', { count: notStarted })}</span>
      </article>
      <article className="analysis-overview__card analysis-overview__card--done">
        <strong>{t('analysis.done', { count: view.summary.done })}</strong>
        <span>{t('analysis.doneHint')}</span>
      </article>
      <article className="analysis-overview__card">
        <strong>{t('analysis.inProgress', { count: view.summary.in_progress })}</strong>
        <span>{t('analysis.inProgressHint')}</span>
      </article>
    </section>

    {selected && <>
      <div className="analysis-question-bar">
        <div role="tablist" aria-label={t('analysis.questions')} className="analysis-question-tabs">
          {view.questions.map((question, index) => <button key={question.question_id} type="button" role="tab"
            aria-selected={question.question_id === selected.question_id}
            onClick={() => chooseQuestion(question)}
          >{t('analysis.questionTab', { number: index + 1, title: question.title })}</button>)}
        </div>
        <Link className="analysis-ai-link" to={`/teach/activities/${view.activity_id}/analysis/ai`}>{t('analysis.ai')}</Link>
      </div>

      <section className="analysis-distribution" aria-labelledby="analysis-stance-title">
        <div className="analysis-distribution__head">
          <h2 id="analysis-stance-title">{t('analysis.stances')}</h2>
          <span>{selected.unconfirmed > 0
            ? t('analysis.confirmedWithUnconfirmed', { confirmed: selected.confirmed, unconfirmed: selected.unconfirmed })
            : t('analysis.confirmed', { confirmed: selected.confirmed })}</span>
        </div>
        <p className="analysis-changed">{t('analysis.changed', { changed: selected.changed, comparable: selected.comparable })}</p>
        <div className="analysis-options">
          {selected.options.map((option, index) => <AnalysisOption key={option.option_id} question={selected} option={option}
            letter={optionLetter(index)} oldLetter={oldId => {
              const oldIndex = selected.options.findIndex(candidate => candidate.option_id === oldId)
              return oldIndex < 0 ? '?' : optionLetter(oldIndex)
            }}
            expanded={expanded.has(option.option_id)} showAll={showAll.has(option.option_id)}
            onToggle={() => toggleOption(option.option_id)} onShowAll={() => setShowAll(current => new Set(current).add(option.option_id))}
          />)}
        </div>
      </section>
    </>}
  </main>
}

function AnalysisOption({ question, option, letter, oldLetter, expanded, showAll, onToggle, onShowAll }: {
  question: Question
  option: Option
  letter: string
  oldLetter(id: string): string
  expanded: boolean
  showAll: boolean
  onToggle(): void
  onShowAll(): void
}) {
  const { t } = useT('teach')
  const value = percent(option.count, question.confirmed)
  const visible = showAll ? option.students : option.students.slice(0, 4)
  const regionId = `analysis-option-${question.question_id}-${option.option_id}`

  return <article className={`analysis-option analysis-option--${letter.toLowerCase()}`}>
    <button type="button" className="analysis-option__button" aria-expanded={expanded} aria-controls={regionId} onClick={onToggle}
      aria-label={t('analysis.optionLabel', { letter, text: option.text, count: option.count, percent: value })}>
      <span className="analysis-option__letter">{letter}</span>
      <span className="analysis-option__text">{option.text}</span>
      <span className="analysis-option__track" aria-hidden="true"><span style={{ width: `${value}%` }} /></span>
      <strong>{t('analysis.people', { count: option.count })}</strong>
      <span>{value}%</span>
      <span className="analysis-option__chevron" aria-hidden="true">⌄</span>
    </button>
    {expanded && <section id={regionId} className="analysis-students" role="region" aria-label={t('analysis.studentsTitle', { letter })}>
      <header><strong>{t('analysis.studentsTitle', { letter })}</strong><span>{t('analysis.people', { count: option.count })}</span></header>
      {visible.map(item => <div className="analysis-student" key={item.enrollment_id}>
        <div className="analysis-student__head"><strong>{item.display_name}</strong>
          {item.changed_from_option_id && <span className="analysis-student__tag">{t('analysis.changedTag', { from: oldLetter(item.changed_from_option_id), to: letter })}</span>}
        </div>
        <p>{item.reason_summary}</p>
        {item.relevant_conditions.length > 0 && <p className="analysis-student__conditions">{t('analysis.conditions', { conditions: item.relevant_conditions.join('；') })}</p>}
      </div>)}
      {option.count === 0 && <p className="analysis-students__empty">{t('analysis.emptyOption')}</p>}
      {!showAll && option.students.length > 4 && <button type="button" className="analysis-show-all" onClick={onShowAll}>{t('analysis.showAll', { count: option.count })}</button>}
    </section>}
  </article>
}
