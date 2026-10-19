import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError, api } from '../../api/classroomClient'
import type { components } from '../../api/classroomTypes'
import { useResource } from '../../api/useResource'
import { errorCode, errorMessage } from '../../i18n/errors'
import { formatDateTime } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import { ChalkCard, JoinLayout } from './JoinLayout'

type Preview = components['schemas']['ActivityJoinPreview']

/** J2m／J2m-s: an activity QR. Joining the activity also enrolls in its course. */
export function JoinActivityPage() {
  const { t, locale } = useT('join')
  const { activityId = '' } = useParams()
  const navigate = useNavigate()
  const preview = useResource<Preview>(`/activities/${activityId}/join-preview`)
  const [name, setName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const [endedNow, setEndedNow] = useState(false)
  const data = preview.data

  if (preview.loading && !data) return <JoinLayout><div aria-busy="true" /></JoinLayout>
  if (!data) {
    const notFound = preview.error instanceof ApiError && preview.error.status === 404
    return <JoinLayout><section className="join-message">
      <h1>{notFound ? t('activity.notFoundTitle') : errorMessage(t, preview.error)}</h1>
      {notFound && <p>{t('activity.notFoundBody')}</p>}
      <Link className="button button--outline" to="/">{t('activity.home')}</Link>
    </section></JoinLayout>
  }

  const status = endedNow ? 'ended' : data.status
  const enrolled = data.already_enrolled
  const displayName = name ?? data.default_display_name
  const date = (seconds: number) => formatDateTime(seconds, locale, 'weekdayDateTime')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!displayName.trim()) return
    setBusy(true)
    setFailure(null)
    try {
      await api(`/activities/${data!.activity_id}/join`, 'POST', { display_name: displayName.trim() })
      navigate(status === 'open' ? `/learn/activities/${data!.activity_id}` : `/learn/courses/${data!.course_id}`)
    } catch (error) {
      if (errorCode(error) === 'ACTIVITY_ENDED') setEndedNow(true)
      else setFailure(error)
    } finally {
      setBusy(false)
    }
  }

  const title = status === 'open' ? t('activity.inviteTitle') : status === 'scheduled' ? t('activity.scheduledTitle') : t('activity.endedTitle')
  const windowRow = status === 'open'
    ? { label: t('activity.openUntil'), value: <span className="chalk-card__live">{date(data.ends_at)}</span> }
    : status === 'scheduled'
      ? { label: t('activity.opens'), value: <span className="chalk-card__soon">{t('activity.opensAt', { start: date(data.starts_at) })}</span> }
      : { label: t('activity.ended'), value: date(data.ends_at) }
  const note = status === 'ended' ? t('activity.endedNote')
    : enrolled ? null
    : status === 'open' ? t('activity.notStudent', { course: data.course_name }) : t('activity.scheduledNote', { course: data.course_name })
  const canJoin = status === 'open' || (status === 'scheduled' && !enrolled)

  return <JoinLayout>
    <form className="join-sheet" onSubmit={event => void submit(event)} noValidate>
      <h1>{title}</h1>
      <ChalkCard
        eyebrow={t('activity.byline', { course: data.course_name, teacher: data.teacher_name })}
        title={data.title}
        rows={[{ label: t('activity.questions'), value: t('activity.questionCount', { count: data.question_count }) }, windowRow]}
      />
      {note && <p className="join-note"><span aria-hidden="true">ⓘ</span>{note}</p>}
      {canJoin && !enrolled && <div className="form-field">
        <label htmlFor="join-activity-name">{t('activity.name')}</label>
        <input id="join-activity-name" value={displayName} maxLength={40} onChange={event => setName(event.target.value)} />
      </div>}
      {canJoin
        ? <button type="submit" className="button button--primary join-sheet__submit" disabled={busy || !displayName.trim()}>
            {status === 'open' ? (enrolled ? t('activity.start') : t('activity.joinAndStart')) : t('activity.joinCourse')}<span aria-hidden="true">→</span>
          </button>
        : <Link className="button button--primary join-sheet__submit" to={enrolled ? `/learn/courses/${data.course_id}` : '/'}>
            {enrolled ? t('activity.toCourse') : t('activity.home')}
          </Link>}
      {failure && <p role="alert" className="form-error">{errorMessage(t, failure)}</p>}
      {canJoin && <Link className="join-link" to="/">{t('activity.notThis')}</Link>}
    </form>
  </JoinLayout>
}
