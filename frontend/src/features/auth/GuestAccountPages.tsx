import { type FormEvent, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { api } from '../../contract/classroomClient'
import { errorCode, errorMessage } from '../../i18n/errors'
import { useT } from '../../i18n/useT'
import { safeNext } from '../../shared/next'
import { Button, ButtonLink, Field, FieldError, FieldHint } from '../../ui'
import { JoinLayout } from './JoinLayout'
import { useAuth } from './AuthContext'
import { markUpgraded, useKeepUntil } from './GuestPanels'
import { type Field as FormField, keepPasswordChars, LOGIN_PASSWORD_MAX, problemsFrom422, registerProblems, REGISTER_LIMITS, type Problem } from './registerChecks'

type Issue = Problem | { field: FormField; code: string }

function useIssueText() {
  const { t } = useT('auth')
  return (issue: Issue) => 'code' in issue
    ? t(`common:errors.${issue.code}`)
    : t(`fieldErrors.${issue.field}.${issue.kind}`, { min: issue.min, max: issue.max })
}

/** A guest registers in place (the design's register-to-keep screens). Like any registration the email must be verified before
 * classes go on (E2); afterwards home shows G26. An email already registered leads to G19 → G21. */
export function GuestUpgradePage() {
  const { t } = useT('guest')
  const { t: ta } = useT('auth')
  const issueText = useIssueText()
  const { account, signIn } = useAuth()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [values, setValues] = useState({ username: '', email: '', password: '' })
  const [issues, setIssues] = useState<Partial<Record<FormField, Issue>>>({})
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const [taken, setTaken] = useState(false)
  const [done, setDone] = useState(false)

  if (done) return <Navigate to={'/verify?next=' + encodeURIComponent(next)} replace />
  if (account && account.kind !== 'guest') return <Navigate to={next} replace />

  function set(field: FormField, value: string) {
    setValues(current => ({ ...current, [field]: field === 'password' ? keepPasswordChars(value).kept : value }))
    setIssues(current => ({ ...current, [field]: undefined }))
    if (field === 'email') setTaken(false)
  }

  function show(list: Issue[]) {
    setIssues(Object.fromEntries(list.map(issue => [issue.field, issue])))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const body = { username: values.username, email: values.email.trim(), password: values.password }
    const problems = registerProblems(body)
    if (problems.length) return show(problems)
    setBusy(true)
    setFailure(null)
    try {
      signIn(await api('/auth/guest/upgrade', 'POST', body))
      markUpgraded()
      setDone(true)
    } catch (error) {
      const code = errorCode(error)
      if (code === 'EMAIL_TAKEN') setTaken(true)
      else if (code === 'USERNAME_TAKEN') show([{ field: 'username', code }])
      else if ((error as { status?: number })?.status === 422 && problemsFrom422((error as { detail?: unknown }).detail).length) {
        show(problemsFrom422((error as { detail?: unknown }).detail))
      } else setFailure(error)
    } finally {
      setBusy(false)
    }
  }

  const loginWithEmail = '/guest/login?' + new URLSearchParams({ email: values.email.trim(), next }).toString()

  function input(field: FormField, label: string, type: string, autoComplete: string, hint?: string) {
    const issue = issues[field]
    return <Field id={`guest-${field}`} label={label} invalid={Boolean(issue)} className="join-field">
      <input id={`guest-${field}`} type={type} value={values[field]} autoComplete={autoComplete} disabled={busy}
        maxLength={REGISTER_LIMITS[field][1]} aria-invalid={issue ? true : undefined}
        onChange={event => set(field, event.target.value)} />
      {issue ? <FieldError>{issueText(issue)}</FieldError> : hint && <FieldHint>{hint}</FieldHint>}
    </Field>
  }

  // One message at a time (the design's rule): a failed check, an email that is taken, or the plain
  // verification note, never two of them together.
  const hasIssues = Object.values(issues).some(Boolean)
  const banner = taken ? t('upgrade.emailTakenAlert')
    : hasIssues ? t('upgrade.checkFields')
      : failure !== null ? errorMessage(t, failure) : null

  return <JoinLayout>
    <div className="join-login">
      <form className="join-login__card" onSubmit={event => void submit(event)} noValidate aria-busy={busy}>
        <h1>{t('upgrade.title')}</h1>
        <p className="join-login__lead">{t('upgrade.body')}</p>
        {banner !== null
          ? <p className="join-alert join-alert--error" role="alert">{banner}</p>
          : <p className="join-alert join-alert--info">{t('upgrade.verifyNote')}</p>}
        {input('username', ta('fields.username'), 'text', 'username', t('upgrade.usernameHint'))}
        {input('email', ta('fields.email'), 'email', 'email')}
        {input('password', ta('fields.password'), 'password', 'new-password', t('upgrade.passwordHint'))}
        {taken
          ? <>
            <ButtonLink variant="primary" className="join-login__submit" to={loginWithEmail}>{t('upgrade.emailTakenLogin')}</ButtonLink>
            <Button variant="outline" className="join-login__submit" onClick={() => setTaken(false)}>{t('upgrade.emailTakenOther')}</Button>
          </>
          : <>
            {banner !== null && hasIssues && <p className="join-field-hint">{t('upgrade.verifyNote')}</p>}
            <Button type="submit" variant="primary" className="join-login__submit" disabled={busy}>
              {busy ? t('upgrade.submitting') : t('upgrade.submit')}
            </Button>
            <p className="join-login__after">
              <Link className="join-link join-link--inline" to={'/guest/login?next=' + encodeURIComponent(next)}>{t('upgrade.haveAccount')}</Link>
            </p>
          </>}
      </form>
      <p className="join-login__note"><Link className="join-link join-link--inline join-link--quiet" to="/">{t('upgrade.back')}</Link></p>
    </div>
  </JoinLayout>
}

/** A guest logs in to an existing account (the design's log-in-and-merge screens); the backend (Courecta's 5a) moves this device's
 * guest records into it. The login answer says what happened (guest_merge): only MERGED shows G25; a teacher account still logs
 * in but nothing moves (REFUSED_TEACHER, G24); NONE (no guest cookie, expired, a hook rolled back) is a plain login. */
export function GuestLoginPage() {
  const { t } = useT('guest')
  const { t: ta } = useT('auth')
  const { account, signIn } = useAuth()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [login, setLogin] = useState(params.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const [refused, setRefused] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const keep = useKeepUntil(account)

  if (done) return <Navigate to={done} replace />
  if (refused) return <JoinLayout>
    <div className="join-login">
      <section className="join-login__card" role="status">
        <h1>{t('merge.teacherTitle')}</h1>
        <p className="join-alert join-alert--info">{t('merge.teacherBody')}</p>
        <Link className="join-link join-link--inline" to={next}>{t('merge.teacherContinue')}</Link>
      </section>
    </div>
  </JoinLayout>
  if (account && account.kind !== 'guest') return <Navigate to={next} replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setFailure(null)
    try {
      const view = await api('/auth/login', 'POST', { login, password })
      signIn(view)
      if (view.guest_merge === 'REFUSED_TEACHER') {
        setRefused(true)
        return
      }
      const target = view.guest_merge === 'MERGED' && next === '/' ? '/?merged=1' : next
      setDone(view.verified ? target : '/verify?next=' + encodeURIComponent(target))
    } catch (error) {
      setFailure(error)
    } finally {
      setBusy(false)
    }
  }

  return <JoinLayout>
    <div className="join-login">
      <form className="join-login__card" onSubmit={event => void submit(event)} aria-busy={busy}>
        <h1>{t('merge.title')}</h1>
        <p className="join-login__lead">{t('merge.body')}</p>
        {failure !== null && <p className="join-alert join-alert--error" role="alert">{errorMessage(t, failure)}</p>}
        <Field id="guest-login" label={ta('fields.identifier')} invalid={failure !== null} className="join-field">
          <input id="guest-login" value={login} autoComplete="username" required disabled={busy} maxLength={REGISTER_LIMITS.email[1]} onChange={event => setLogin(event.target.value)} />
        </Field>
        <Field id="guest-password" label={ta('fields.password')} invalid={failure !== null} className="join-field">
          <input id="guest-password" type="password" value={password} autoComplete="current-password" required disabled={busy} maxLength={LOGIN_PASSWORD_MAX} onChange={event => setPassword(event.target.value)} />
        </Field>
        <p className="join-login__after"><Link className="join-link join-link--inline join-link--quiet" to="/login?mode=forgot">{t('merge.forgot')}</Link></p>
        <Button type="submit" variant="primary" className="join-login__submit" disabled={busy}>{busy ? t('merge.submitting') : t('merge.submit')}</Button>
        <p className="join-login__after">
          <Link className="join-link join-link--inline" to={'/guest/register?next=' + encodeURIComponent(next)}>{t('merge.register')}</Link>
        </p>
      </form>
      {keep && <p className="join-login__note">{t('merge.keep', { date: keep.date })}</p>}
    </div>
  </JoinLayout>
}
