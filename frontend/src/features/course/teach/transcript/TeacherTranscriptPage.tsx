import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../../../contract/classroomClient'
import { useResource } from '../../../../contract/useResource'
import { formatDateTime } from '../../../../i18n/format'
import { useT } from '../../../../i18n/useT'
import { ButtonLink } from '../../../../ui'
import '../../../../styles/teach.css'
import '../../../../styles/teacher-live.css'
import '../../../../styles/teacher-transcript.css'
import { TranscriptChat, type ChatHandle } from './TranscriptChat'
import { TranscriptState } from './TranscriptStates'
import { TranscriptTrack } from './TranscriptTrack'
import { isStopped, stopKind, type Transcript } from './transcriptModel'
import { studentName, type T } from './transcriptText'

const REFRESH_MS = 10_000

/** The course owner reads one student's whole conversation, read only. The student is never told, and never sees this. */
export function TeacherTranscriptPage() {
  const { activityId, enrollmentId } = useParams()
  const { t, locale } = useT('teach')
  const resource = useResource<Transcript>(activityId && enrollmentId ? `/solo/activities/${activityId}/students/${enrollmentId}/attempt` : null)
  const [retrying, setRetrying] = useState(false)
  const chat = useRef<ChatHandle>(null)
  // The scenario the teacher is reading; until the chat reports one it is the student's own.
  const [viewing, setViewing] = useState<number | null>(null)
  const data = resource.data
  const stopped = data ? isStopped(data) : false
  const backTo = activityId ? `/teach/activities/${activityId}` : '/'

  // Every 10 seconds, like the live page; a failed refresh keeps what is on screen and the next one tries again.
  useEffect(() => {
    if (stopped) return
    const timer = window.setInterval(() => { void resource.reload() }, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [resource.reload, stopped])

  async function retry() {
    setRetrying(true)
    try { await resource.reload() } finally { setRetrying(false) }
  }

  const header = <TranscriptHeader transcript={data} backTo={backTo} />
  let body
  if (!data) {
    const notFound = resource.error instanceof ApiError && resource.error.status === 404
    body = resource.error && !retrying
      ? <TranscriptState kind={notFound ? 'notFound' : 'failed'} backTo={backTo} onRetry={() => { void retry() }} />
      : <TranscriptState kind="loading" backTo={backTo} />
  } else if (data.attempt === null) {
    body = <TranscriptState kind="notStarted" backTo={backTo} />
  } else {
    const name = studentName(t as T, data.student)
    const stop = stopKind(data)
    const time = data.student.last_activity_at === null ? '—' : formatDateTime(data.student.last_activity_at, locale, 'time')
    const footer = t(`transcript.footer.${stop ?? 'running'}`, { time })
    const attempt = data.attempt
    const capped = attempt.state === 'confirming' && attempt.scenarios.find(scenario => scenario.index === attempt.scenario_index)?.status === 'capped'
    const banner = stop === 'completed' ? 'completed' : stop === 'unconfirmed' ? 'unconfirmed' : capped ? 'capped' : stop === 'ended' ? 'ended' : null
    body = <>
      {banner && <p className={`transcript-banner transcript-banner--${banner}`} role="status">{t(`transcript.banner.${banner}`)}</p>}
      <div className="transcript-body">
        <TranscriptChat ref={chat} attempt={attempt} studentName={name} footer={footer} onViewing={setViewing} />
        <TranscriptTrack attempt={attempt} name={name} viewing={viewing ?? attempt.scenario_index} onJump={index => chat.current?.jumpToScenario(index)} />
      </div>
    </>
  }

  return <main className="teach-page transcript-page" data-testid="teacher-transcript-page">
    {header}
    {body}
  </main>
}

function TranscriptHeader({ transcript, backTo }: { transcript: Transcript | null; backTo: string }) {
  const { t } = useT('teach')
  const activity = transcript?.activity
  return <header className="teach-head transcript-head">
    <div className="teach-head__title">
      <nav className="teach-head__crumb" aria-label={t('transcript.crumbLabel')}>
        <Link to="/?tab=teach">{t('transcript.crumb.home')}</Link>
        {activity && <>
          <span aria-hidden="true"> ／ </span><Link to={`/teach/courses/${activity.course_id}`}>{activity.course_name}</Link>
          <span aria-hidden="true"> ／ </span><Link to={backTo}>{activity.title}</Link>
          <span aria-hidden="true"> ／ </span><span>{t('transcript.crumb.live')}</span>
        </>}
      </nav>
      <h1>{activity ? activity.title : t('transcript.title')}</h1>
    </div>
    <ButtonLink variant="outline" to={backTo}>{t('transcript.back')}</ButtonLink>
  </header>
}
