import { type FormEvent, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { api } from '../../contract/classroomClient'
import { errorCode, errorMessage } from '../../i18n/errors'
import { useT } from '../../i18n/useT'
import { safeNext } from '../../shared/next'
import { Button, Field, FieldError, FormError } from '../../ui'
import { AuthLayout, Screws } from './AuthLayout'
import { useAuth } from './AuthContext'
import { markUpgraded } from './GuestPanels'
import { type Field as FormField, keepPasswordChars, LOGIN_PASSWORD_MAX, problemsFrom422, registerProblems, REGISTER_LIMITS, type Problem } from './registerChecks'

// Courecta's 5a will refuse merging a guest into a teacher account with this code once account_role
// lands; until then G24 is reached only by a faked response in tests. Agree the name with Courecta.
export const TEACHER_MERGE_REFUSED = 'GUEST_MERGE_TEACHER_REFUSED'

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

  function input(field: FormField, label: string, type: string, autoComplete: string) {
    const issue = issues[field]
    return <Field id={`guest-${field}`} label={label} invalid={Boolean(issue)}>
      <input id={`guest-${field}`} type={type} value={values[field]} autoComplete={autoComplete} disabled={busy}
        maxLength={REGISTER_LIMITS[field][1]} aria-invalid={issue ? true : undefined}
        onChange={event => set(field, event.target.value)} />
      {issue && <FieldError>{issueText(issue)}</FieldError>}
    </Field>
  }

  return <AuthLayout>
    <main className="auth-main auth-main--center">
      <form className="auth-card auth-card--wide" onSubmit={event => void submit(event)} noValidate aria-busy={busy}>
        <Screws />
        <h1>{t('upgrade.title')}</h1>
        <p className="auth-card__hint">{t('upgrade.body')}</p>
        {input('username', ta('fields.username'), 'text', 'username')}
        {input('email', ta('fields.email'), 'email', 'email')}
        {taken && <section className="join-notice join-notice--warn" role="alert">
          <strong>{t('upgrade.emailTakenTitle')}</strong>
          <p>{t('upgrade.emailTakenBody')}</p>
          <Link className="auth-button auth-button--primary" to={loginWithEmail}>{t('upgrade.emailTakenLogin')}</Link>
        </section>}
        {input('password', ta('fields.password'), 'password', 'new-password')}
        <small className="auth-field__hint">{ta('passwordRule')}</small>
        <p className="auth-card__hint">{t('upgrade.verifyNote')}</p>
        <button type="submit" className="auth-button auth-button--primary" disabled={busy}>
          {busy ? t('upgrade.submitting') : t('upgrade.submit')}<span aria-hidden="true">→</span>
        </button>
        {failure !== null && <FormError role="alert">{errorMessage(t, failure)}</FormError>}
        <div className="auth-card__links">
          <Link className="auth-button auth-button--quiet" to={'/guest/login?next=' + encodeURIComponent(next)}>{t('upgrade.haveAccount')}</Link>
          <Link className="auth-button auth-button--quiet" to="/">{t('upgrade.back')}</Link>
        </div>
      </form>
    </main>
  </AuthLayout>
}

/** A guest logs in to an existing account (the design's log-in-and-merge screens); the backend (Courecta's 5a) moves this device's
 * guest records into it. Home then shows G25. A teacher account is refused (G24). */
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
  const [teacher, setTeacher] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  if (done) return <Navigate to={done} replace />
  if (account && account.kind !== 'guest') return <Navigate to={next} replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setFailure(null)
    setTeacher(false)
    try {
      const view = await api('/auth/login', 'POST', { login, password })
      signIn(view)
      const target = next === '/' ? '/?merged=1' : next
      setDone(view.verified ? target : '/verify?next=' + encodeURIComponent(target))
    } catch (error) {
      if (errorCode(error) === TEACHER_MERGE_REFUSED) setTeacher(true)
      else setFailure(error)
    } finally {
      setBusy(false)
    }
  }

  return <AuthLayout>
    <main className="auth-main auth-main--center">
      <form className="auth-card auth-card--wide" onSubmit={event => void submit(event)} aria-busy={busy}>
        <Screws />
        <h1>{t('merge.title')}</h1>
        <p className="auth-card__hint">{t('merge.body')}</p>
        {teacher && <section className="join-notice join-notice--warn" role="alert">
          <strong>{t('merge.teacherTitle')}</strong>
          <p>{t('merge.teacherBody')}</p>
        </section>}
        <Field id="guest-login" label={ta('fields.identifier')}>
          <input id="guest-login" value={login} autoComplete="username" required disabled={busy} maxLength={REGISTER_LIMITS.email[1]} onChange={event => setLogin(event.target.value)} />
        </Field>
        <Field id="guest-password" label={ta('fields.password')}>
          <input id="guest-password" type="password" value={password} autoComplete="current-password" required disabled={busy} maxLength={LOGIN_PASSWORD_MAX} onChange={event => setPassword(event.target.value)} />
        </Field>
        <Button type="submit" variant="primary" disabled={busy}>{busy ? t('merge.submitting') : t('merge.submit')}</Button>
        {failure !== null && <FormError role="alert">{errorMessage(t, failure)}</FormError>}
        <div className="auth-card__links">
          <Link className="auth-button auth-button--quiet" to={'/guest/register?next=' + encodeURIComponent(next)}>{t('merge.register')}</Link>
          <Link className="auth-button auth-button--quiet" to="/">{t('upgrade.back')}</Link>
        </div>
      </form>
    </main>
  </AuthLayout>
}
