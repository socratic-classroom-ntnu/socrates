import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { components } from '../../../contract/classroomTypes'
import { useResource } from '../../../contract/useResource'
import { errorMessage } from '../../../i18n/errors'
import { useT } from '../../../i18n/useT'
import '../../../styles/teach.css'
import '../../../styles/teacher-live.css'
import '../../../styles/teacher-analysis.css'
import { ActivityPageHeader } from './ActivityPageHeader'
import { ANALYSIS_DEMO, ANALYSIS_SOURCE } from './analysisDemo'

type Analysis = components['schemas']['SoloActivityAnalysisView']
type Progress = components['schemas']['SoloActivityProgressView']
type Student = components['schemas']['SoloAnalysisStudentView']

const FIRST_SHOWN = 4

export function TeacherAnalysisPage({ source = ANALYSIS_SOURCE }: { source?: 'api' | 'demo' }) {
  const { activityId } = useParams()
  const { t } = useT('teach')
  const analysis = useResource<Analysis>(source === 'api' && activityId ? `/solo/activities/${activityId}/analysis` : null)
  const progress = useResource<Progress>(source === 'demo' && activityId ? `/solo/activities/${activityId}/progress` : null)
  const [showAll, setShowAll] = useState(false)

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
      ends_at: progress.data.ends_at,
      generated_at: progress.data.generated_at,
    }
  }, [analysis.data, progress.data, source])

  const resource = source === 'api' ? analysis : progress
  if (resource.loading && !view) return <div aria-busy="true" />
  if (!view) return <main className="teach-page teach-page--message"><p role="alert" className="form-error">{errorMessage(t, resource.error)}</p></main>

  const notStarted = Math.max(0, view.summary.enrolled - view.summary.started)
  // Only viewpoints a student has confirmed are shown; someone still on their first answer has none yet.
  const confirmed = view.students.filter(student => student.confirmed_scenarios > 0)
  const visible = showAll ? confirmed : confirmed.slice(0, FIRST_SHOWN)

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

    <div className="analysis-viewpoints-bar">
      <h2 id="analysis-viewpoints-title">{t('analysis.viewpoints')}</h2>
      <Link className="analysis-ai-link" to={`/teach/activities/${view.activity_id}/analysis/ai`}>{t('analysis.ai')}</Link>
    </div>

    <section className="analysis-students" role="region" aria-labelledby="analysis-viewpoints-title">
      <header><span>{t('analysis.people', { count: confirmed.length })}</span></header>
      {visible.map(item => <StudentViewpoint key={item.enrollment_id} student={item} />)}
      {confirmed.length === 0 && <p className="analysis-students__empty">{t('analysis.empty')}</p>}
      {!showAll && confirmed.length > FIRST_SHOWN && <button type="button" className="analysis-show-all" onClick={() => setShowAll(true)}>{t('analysis.showAll', { count: confirmed.length })}</button>}
    </section>
  </main>
}

function StudentViewpoint({ student }: { student: Student }) {
  const { t } = useT('teach')
  return <div className="analysis-student">
    <div className="analysis-student__head">
      <strong>{student.display_name}</strong>
      <span className="analysis-student__tag">{t('analysis.confirmedScenarios', { count: student.confirmed_scenarios })}</span>
    </div>
    <p className="analysis-student__position">{student.current_position}</p>
    <p>{student.reason_summary}</p>
    {student.relevant_conditions.length > 0 && <p className="analysis-student__conditions">{t('analysis.conditions', { conditions: student.relevant_conditions.join('；') })}</p>}
  </div>
}
