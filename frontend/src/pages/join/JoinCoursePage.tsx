import { type FormEvent, useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, api } from '../../api/classroomClient'
import type { components } from '../../api/classroomTypes'
import { useResource } from '../../api/useResource'
import { useIsPhone } from '../../app/useIsPhone'
import { CopyButton } from '../../components/CopyButton'
import { errorMessage } from '../../i18n/errors'
import { useT } from '../../i18n/useT'
import { ChalkCard, JoinLayout } from './JoinLayout'

type Preview = components['schemas']['JoinPreview']
/** What the code form hands over so J1 does not ask for the same preview twice. */
export type HandedPreview = Preview & { code: string }

/** J1: confirm joining the course behind a course code; already-enrolled students skip it. */
export function JoinCoursePage() {
  const [params] = useSearchParams()
  const code = (params.get('code') ?? '').replace(/\s+/g, '').toUpperCase()
  if (!code) return <Navigate to="/" replace />
  return <JoinCourse code={code} />
}

function JoinCourse({ code }: { code: string }) {
  const { t } = useT('join')
  const phone = useIsPhone()
  const navigate = useNavigate()
  const handed = (useLocation().state as { preview?: HandedPreview } | null)?.preview
  const reused = handed?.code === code ? handed : null
  const fetched = useResource<Preview>(reused ? null : '/course-join/preview?code=' + encodeURIComponent(code))
  const preview = reused ? { data: reused, loading: false, error: null } : fetched
  const [name, setName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const [missingName, setMissingName] = useState(false)
  const data = preview.data

  useEffect(() => {
    if (data?.already_enrolled) navigate(`/learn/courses/${data.course_id}`, { replace: true })
  }, [data, navigate])

  if (preview.loading && !data) return <JoinLayout><div aria-busy="true" /></JoinLayout>
  if (!data) {
    const notFound = preview.error instanceof ApiError && preview.error.status === 404
    return <JoinLayout><section className="join-message">
      <h1>{notFound ? t('course.notFoundTitle') : errorMessage(t, preview.error)}</h1>
      {notFound && <p>{t('course.notFoundBody')}</p>}
      <Link className="button button--outline" to="/">{t('course.home')}</Link>
    </section></JoinLayout>
  }
  if (data.already_enrolled) return null

  const displayName = name ?? data.default_display_name
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!displayName.trim()) return setMissingName(true)
    setBusy(true)
    setFailure(null)
    try {
      await api('/courses/join', 'POST', { code, display_name: displayName.trim() })
      navigate(`/learn/courses/${data!.course_id}`)
    } catch (error) {
      setFailure(error)
    } finally {
      setBusy(false)
    }
  }

  const nameField = <div className={'form-field' + (missingName ? ' form-field--error' : '')}>
    <label htmlFor="join-name">{phone ? t('course.phoneName') : t('course.name')}</label>
    <input id="join-name" value={displayName} maxLength={40} aria-invalid={missingName ? true : undefined}
      aria-describedby="join-name-hint" onChange={event => { setName(event.target.value); setMissingName(false) }} />
    <p id="join-name-hint" className={missingName ? 'form-field__error' : 'form-field__hint'}>{missingName ? t('course.nameRequired') : t('course.nameHint')}</p>
  </div>
  const footer = <>
    {failure && <p role="alert" className="form-error">{errorMessage(t, failure)}</p>}
    <Link className="join-link" to="/">{t('course.notThis')}</Link>
  </>

  if (phone) return <JoinLayout>
    <form className="join-sheet" onSubmit={event => void submit(event)} noValidate>
      <h1>{t('course.phoneTitle')}</h1>
      <ChalkCard title={data.name} rows={[
        { label: t('course.teacherLabel'), value: data.teacher_name },
        { label: t('course.code'), value: <span className="chalk-card__code">{code}<CopyButton text={code} label={t('course.copyCode')} iconOnly className="chalk-card__copy" /></span> },
        ...(data.open_activity_title ? [{ label: t('course.now'), value: <span className="chalk-card__live">{t('course.liveShort', { title: data.open_activity_title })}</span> }] : []),
      ]} />
      {nameField}
      <button type="submit" className="button button--primary join-sheet__submit" disabled={busy}>{t('course.phoneEnter')}<span aria-hidden="true">→</span></button>
      {footer}
    </form>
  </JoinLayout>

  return <JoinLayout scene>
    <form className="join-plaque" onSubmit={event => void submit(event)} noValidate>
      <div className="join-plaque__sign">
        <h1>{data.name}</h1>
        <span>{t('course.teacher', { name: data.teacher_name })}</span>
      </div>
      <dl className="join-plaque__rows">
        <div><dt>{t('course.host')}</dt><dd>{t('course.socrates')}</dd></div>
        <div><dt>{t('course.code')}</dt><dd className="join-plaque__code">{code}<CopyButton text={code} label={t('course.copyCode')} iconOnly className="icon-button icon-button--quiet" /></dd></div>
      </dl>
      {data.open_activity_title && <p className="join-plaque__live">{t('course.live', { title: data.open_activity_title })}</p>}
      {nameField}
      <button type="submit" className="button button--dark join-plaque__submit" disabled={busy}>{t('course.enter')}<span aria-hidden="true">→</span></button>
      {footer}
    </form>
    <div className="join-door" aria-hidden="true"><span className="join-door__window" /><span className="join-door__handle" /><span className="join-door__panel" /><span className="join-door__panel" /></div>
  </JoinLayout>
}
