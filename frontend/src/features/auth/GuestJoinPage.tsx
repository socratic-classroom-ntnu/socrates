import { type FormEvent, useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { ApiError, api } from '../../contract/classroomClient'
import type { components } from '../../contract/classroomTypes'
import { errorCode, errorMessage } from '../../i18n/errors'
import { useT } from '../../i18n/useT'
import { joinTarget, safeNext } from '../../shared/next'
import { Button, Field, FieldError, FieldHint, FormError } from '../../ui'
import { useAuth } from './AuthContext'
import { GUEST_NAME_MAX, guestName, nameLength } from './guestNames'
import { JoinLayout } from './JoinLayout'
import { JoinLoginBanner, usePublicPreview } from './JoinLoginCard'
import { useChangeLocale } from './useChangeLocale'
import { isLocale, LANGUAGE_NAMES, LOCALES } from '../../i18n/locale'

type Result = components['schemas']['GuestJoinResult']
type Problem = 'blank' | 'tooLong' | null

/** The guest name page: pick a name and a language, then become a guest and join in one request.
 * Afterwards the student goes straight to the course (03) or the open activity, never through
 * the join confirmation. */
export function GuestJoinPage() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const target = joinTarget(next)
  if (!target) return <Navigate to="/" replace />
  return <GuestJoin next={next} target={target} />
}

function GuestJoin({ next, target }: { next: string; target: NonNullable<ReturnType<typeof joinTarget>> }) {
  const { t, locale } = useT('guest')
  const { account, refresh, signIn } = useAuth()
  const { courseName } = usePublicPreview(target)
  const { changeLocale, saving } = useChangeLocale()
  const [name, setName] = useState(() => guestName(locale))
  const [edited, setEdited] = useState(false)
  const [problem, setProblem] = useState<Problem>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const [closed, setClosed] = useState(false)
  const [destination, setDestination] = useState<string | null>(null)

  // 換了語言、名字還沒改過：預填的名字也換成那個語言
  useEffect(() => { if (!edited) setName(guestName(locale)) }, [locale, edited])

  if (destination) return <Navigate to={destination} replace />
  // 已經登入（學生或訪客）就照原本的加入流程
  if (account) return <Navigate to={next} replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    const length = nameLength(name)
    if (length === 0) return setProblem('blank')
    if (length > GUEST_NAME_MAX) return setProblem('tooLong')
    setBusy(true)
    setFailure(null)
    setClosed(false)
    try {
      const body = { nickname: name.trim(), locale }
      const result: Result = target.kind === 'course'
        ? await api('/course-join/guest', 'POST', { code: target.code, ...body })
        : await api(`/activities/${encodeURIComponent(target.activityId)}/guest-join`, 'POST', body)
      signIn(result.account)
      setDestination(result.activity_id && result.activity_status === 'open'
        ? `/learn/activities/${result.activity_id}`
        : `/learn/courses/${result.course_id}`)
    } catch (error) {
      const code = errorCode(error)
      if (code === 'GUEST_JOIN_DISABLED') setClosed(true)
      // This device is signed in already (a retry whose first try went through, or a student):
      // read the account again and continue the normal join as it.
      else if (code === 'ALREADY_SIGNED_IN') await refresh()
      else setFailure(error)
    } finally {
      setBusy(false)
    }
  }

  const offline = failure !== null && (!(failure instanceof ApiError) || failure.status === 0)
  const loginPath = '/login?next=' + encodeURIComponent(next)

  return <JoinLayout>
    <div className="join-login">
      <JoinLoginBanner courseName={courseName} kind={target.kind} />
      <form className="join-login__card" onSubmit={event => void submit(event)} noValidate aria-busy={busy}>
        <h1>{t('name.title')}</h1>
        <p className="join-login__intro">{t('name.intro')}</p>
        {closed && <p className="join-notice join-notice--warn" role="alert">
          {t('name.closed')}{' '}
          <Link className="join-link" to={loginPath}>{t('name.login')}</Link>{' · '}
          <Link className="join-link" to={'/login?mode=register&next=' + encodeURIComponent(next)}>{t('name.register')}</Link>
        </p>}
        <p className="join-alert join-alert--info">{t('name.notice')}</p>
        <Field id="guest-name" label={t('name.label')} invalid={problem !== null} className="join-field">
          <div className="join-guest__row">
            <input
              id="guest-name"
              value={name}
              disabled={busy}
              autoComplete="nickname"
              aria-invalid={problem ? true : undefined}
              aria-describedby="guest-name-hint"
              onChange={event => { setName(event.target.value); setEdited(true); setProblem(null) }}
            />
            <button type="button" className="join-guest__shuffle" disabled={busy} onClick={() => { setName(guestName(locale)); setEdited(false); setProblem(null) }}>
              <span aria-hidden="true">↻</span>{t('name.shuffle')}
            </button>
          </div>
          {problem
            ? <FieldError id="guest-name-hint">{t(`name.${problem}`)}</FieldError>
            : <FieldHint id="guest-name-hint" className="join-guest__hint">{t('name.hint')}</FieldHint>}
        </Field>
        <Field id="guest-language" label={t('name.language')} className="join-field">
          <select
            id="guest-language"
            className="join-guest__select"
            value={locale}
            disabled={busy || saving}
            aria-describedby="guest-language-hint"
            onChange={event => { if (isLocale(event.target.value)) void changeLocale(event.target.value) }}
          >
            {LOCALES.map(code => <option key={code} value={code} lang={code}>{LANGUAGE_NAMES[code]}</option>)}
          </select>
          <p id="guest-language-hint" className="join-field-hint join-guest__hint">{t('name.languageHint')}</p>
        </Field>
        <Button type="submit" variant="primary" className="join-login__submit" disabled={busy}>
          {busy ? t('name.submitting') : t(target.kind === 'course' ? 'name.submitCourse' : 'name.submitActivity')}
        </Button>
        {failure !== null && <FormError role="alert">{offline ? t('name.failed') : errorMessage(t, failure)}</FormError>}
      </form>
      <p className="join-login__note"><Link className="join-link join-link--inline" to={loginPath}>{t('name.back')}</Link></p>
    </div>
  </JoinLayout>
}
