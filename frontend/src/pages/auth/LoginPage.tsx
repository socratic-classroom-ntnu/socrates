import { useRef, useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { api } from '../../api/classroomClient'
import { useAuth } from '../../app/AuthContext'
import { joinTarget, safeNext } from '../../app/next'
import { JoinLayout } from '../join/JoinLayout'
import { errorCode, errorMessage } from '../../i18n/errors'
import { useT } from '../../i18n/useT'
import { AuthLayout, Screws } from './AuthLayout'
import { JoinLoginBanner, usePublicCourseName } from './JoinLoginCard'
import { type Field, problemsFrom422, registerProblems, REGISTER_LIMITS, type Problem } from './registerChecks'

type Mode = 'login' | 'register' | 'forgot' | 'reset'
type Note = { key: string } | { error: unknown } | null
// 欄位錯誤存「描述」而不是句子：切換語言時會用新語言重新顯示
type FieldIssue = Problem | { field: Field; code: string }

const TAKEN: Record<string, Field> = { USERNAME_TAKEN: 'username', EMAIL_TAKEN: 'email' }
const LINKS: Record<Mode, Mode[]> = {
  login: ['register', 'forgot'],
  register: ['login', 'forgot'],
  forgot: ['login', 'register'],
  reset: ['login'],
}

function modeOf(params: URLSearchParams): Mode {
  const raw = params.get('mode')
  if (raw === 'reset') return params.get('token') ? 'reset' : 'login'
  return raw === 'register' || raw === 'forgot' ? raw : 'login'
}

export function LoginPage() {
  const { t } = useT('auth')
  const { account, refresh, signIn } = useAuth()
  const [params, setParams] = useSearchParams()
  const mode = modeOf(params)
  const next = safeNext(params.get('next'))
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note>(null)
  const [issues, setIssues] = useState<Partial<Record<Field, FieldIssue>>>({})
  const refs = { username: useRef<HTMLInputElement>(null), email: useRef<HTMLInputElement>(null), password: useRef<HTMLInputElement>(null) }
  // 從課程邀請或活動 QR 來的登入：換成 J0 版面（只有登入模式；註冊、忘記密碼照 E1）
  const join = mode === 'login' ? joinTarget(next) : null
  const courseName = usePublicCourseName(join)

  // 登入或註冊成功後 account 出現：已驗證回原網址，未驗證先到驗證頁（驗證完再回原網址）
  if (account && mode !== 'reset') {
    const target = account.verified ? next : '/verify?next=' + encodeURIComponent(next)
    return <Navigate to={target} replace />
  }

  function switchMode(target: Mode, keepNote: Note = null) {
    const nextParams = new URLSearchParams()
    if (target !== 'login') nextParams.set('mode', target)
    if (params.get('next')) nextParams.set('next', params.get('next'))
    setParams(nextParams, { replace: true })
    setIssues({})
    setNote(keepNote)
  }

  function showIssues(list: FieldIssue[]) {
    setIssues(Object.fromEntries(list.map(issue => [issue.field, issue])))
    setNote(null)
    refs[list[0].field].current?.focus()
  }

  function clearIssue(field: Field) {
    setIssues(current => {
      if (!current[field]) return current
      const copy = { ...current }
      delete copy[field]
      return copy
    })
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      if (mode === 'login') {
        signIn(await api('/auth/login', 'POST', { login: name, password }))
      } else if (mode === 'register') {
        const problems = registerProblems({ username: name, email: email.trim(), password })
        if (problems.length) return showIssues(problems)
        setIssues({})
        signIn(await api('/auth/register', 'POST', { username: name, email: email.trim(), password }))
      } else if (mode === 'forgot') {
        await api('/auth/forgot-password', 'POST', { email })
        // 不論 Email 是否存在都說同一句；後端回的 message 不顯示
        setNote({ key: 'forgot.sent' })
      } else {
        await api('/auth/reset-password', 'POST', { token: params.get('token'), password })
        await refresh() // 後端重設密碼會撤銷所有 session；同步清掉目前頁面的舊帳號狀態。
        setPassword('')
        switchMode('login', { key: 'reset.done' })
      }
    } catch (error) {
      const code = errorCode(error)
      if (mode === 'register' && (error as { status?: number })?.status === 422) {
        const problems = problemsFrom422((error as { detail?: unknown }).detail)
        if (problems.length) return showIssues(problems)
      }
      if (mode === 'register' && code && TAKEN[code]) return showIssues([{ field: TAKEN[code], code }])
      setNote({ error })
    } finally {
      setBusy(false)
    }
  }

  const issueText = (issue: FieldIssue) => 'code' in issue
    ? t(`common:errors.${issue.code}`)
    : t(`fieldErrors.${issue.field}.${issue.kind}`, { min: issue.min, max: issue.max })

  function input(field: Field, label: string, props: Record<string, unknown>) {
    const issue = issues[field]
    const errorId = `register-${field}-error`
    return <div className="auth-field">
      <label>
        {label}
        <input
          ref={refs[field]}
          maxLength={REGISTER_LIMITS[field][1]}
          aria-invalid={issue ? true : undefined}
          aria-describedby={issue ? errorId : undefined}
          {...props}
        />
      </label>
      {issue && <small id={errorId} role="alert" className="auth-field__error">{issueText(issue)}</small>}
    </div>
  }

  const noteText = note === null ? '' : 'key' in note ? t(note.key) : errorMessage(t, note.error)
  const hint = mode === 'register' ? t('register.hint') : mode === 'forgot' ? t('forgot.hint') : ''

  const fields = <>
    {(mode === 'login' || mode === 'register') && input('username', mode === 'login' ? t('fields.identifier') : t('fields.username'), {
      value: name, autoComplete: 'username', required: true,
      maxLength: mode === 'login' ? REGISTER_LIMITS.email[1] : REGISTER_LIMITS.username[1],
      onChange: event => { setName(event.target.value); clearIssue('username') },
    })}
    {(mode === 'register' || mode === 'forgot') && input('email', t('fields.email'), {
      type: 'email', value: email, autoComplete: 'email', required: true,
      onChange: event => { setEmail(event.target.value); clearIssue('email') },
    })}
    {mode !== 'forgot' && input('password', mode === 'reset' ? t('fields.newPassword') : t('fields.password'), {
      type: 'password', value: password, required: true,
      minLength: mode === 'login' ? 1 : REGISTER_LIMITS.password[0],
      autoComplete: mode === 'login' ? 'current-password' : 'new-password',
      onChange: event => { setPassword(event.target.value); clearIssue('password') },
    })}
  </>

  if (join) return <JoinLayout>
    <div className="join-login">
      <JoinLoginBanner courseName={courseName} />
      <form className="join-login__card" onSubmit={event => void submit(event)}>
        <h1>{t('join:login.title')}</h1>
        {fields}
        <button type="submit" className="button button--primary join-login__submit" disabled={busy} aria-busy={busy}>
          {join.kind === 'course' ? t('join:login.submitCourse') : t('join:login.submitActivity')}
        </button>
        <div className="join-login__links">
          <button type="button" className="join-link" onClick={() => switchMode('register')}>{t('join:login.register')}</button>
          <button type="button" className="join-link join-link--quiet" onClick={() => switchMode('forgot')}>{t('join:login.forgot')}</button>
        </div>
        <p role="status" className="auth-card__note">{noteText}</p>
      </form>
      <p className="join-login__note">{t('join:login.registerNote')}</p>
    </div>
  </JoinLayout>

  return <AuthLayout>
    <main className="auth-main">
      <section className="auth-board" aria-label={t('common:brand')}>
        <span className="auth-board__eyebrow"><span className="auth-board__seal" aria-hidden="true">問</span>{t('hero.eyebrow')}</span>
        <p className="auth-board__tagline">{t('hero.tagline')}</p>
        <p className="auth-board__sub">{t('hero.sub')}</p>
      </section>
      <form className="auth-card" noValidate={mode === 'register'} onSubmit={event => void submit(event)}>
        <Screws />
        <h1>{t(`${mode}.title`)}</h1>
        {fields}
        {hint && <p className="auth-card__hint">{hint}</p>}
        <button type="submit" className="auth-button auth-button--primary" disabled={busy} aria-busy={busy}>
          {t(`${mode}.submit`)}<span aria-hidden="true">→</span>
        </button>
        <div className="auth-card__links">
          {LINKS[mode].map(target => <button key={target} type="button" className="auth-button auth-button--quiet" onClick={() => switchMode(target)}>{t(`links.${target}`)}</button>)}
        </div>
        <p role="status" className="auth-card__note">{noteText}</p>
      </form>
    </main>
  </AuthLayout>
}
