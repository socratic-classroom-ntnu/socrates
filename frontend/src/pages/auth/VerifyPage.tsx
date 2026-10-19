import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../../api/classroomClient'
import type { components } from '../../api/classroomTypes'
import { useAuth } from '../../app/AuthContext'
import { safeNext } from '../../app/next'
import { LoadingScreen } from '../../app/RequireAuth'
import { errorMessage } from '../../i18n/errors'
import { useT } from '../../i18n/useT'
import { AuthLayout, Screws } from './AuthLayout'

const COOLDOWN_SECONDS = 30
const POLL_MS = 4000
type Note = { key: string } | { error: unknown } | null
// delivery.preview_url 只在本機 fixture 寄信模式回傳（stage 不會有）：讓開發者不用真的收信也能驗證
type Status = components['schemas']['VerificationStatusView']

function MailIcon() {
  return <span className="auth-card__icon" aria-hidden="true">
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
  </span>
}

// 信裡的連結（?token=）不需要先登入：驗證成功後，已登入就回原網址，未登入就去登入。
function TokenCard({ token, next }: { token: string; next: string }) {
  const { t } = useT('auth')
  const { account, refresh } = useAuth()
  const navigate = useNavigate()
  const [failure, setFailure] = useState<unknown>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return // StrictMode 會跑兩次 effect；一次性的 token 只能送一次
    started.current = true
    void api('/auth/verify', 'POST', { token })
      .then(async () => {
        if (account) {
          await refresh()
          navigate(next, { replace: true })
        } else {
          navigate(next === '/' ? '/login' : '/login?next=' + encodeURIComponent(next), { replace: true })
        }
      })
      .catch(error => setFailure(error ?? new Error('verify failed')))
  }, [token, account, refresh, navigate, next])

  if (!failure) {
    return <main className="auth-main auth-main--center">
      <section className="auth-card auth-card--wide" aria-busy="true"><Screws /><MailIcon /><p role="status">{t('verify.verifying')}</p></section>
    </main>
  }
  return <main className="auth-main auth-main--center">
    <section className="auth-card auth-card--wide">
      <Screws />
      <MailIcon />
      <h1>{t('verify.title')}</h1>
      <p role="alert" className="auth-card__hint">{t('verify.failed')}</p>
      <Link className="auth-button auth-button--primary" to={'/login?next=' + encodeURIComponent('/verify')}>{t(account ? 'verify.resend' : 'verify.loginToResend')}</Link>
    </section>
  </main>
}

function WaitingCard({ next }: { next: string }) {
  const { t } = useT('auth')
  const { account, refresh } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status | null>(null)
  const [note, setNote] = useState<Note>(null)
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  const check = useCallback(async (manual: boolean) => {
    try {
      const value: Status = await api('/auth/verification-status')
      setStatus(value)
      if (value.verified) {
        await refresh()
        navigate(next, { replace: true })
      } else if (manual) {
        setNote({ key: 'verify.notYet' })
      }
    } catch (error) {
      if (manual) setNote({ error })
    }
  }, [refresh, navigate, next])

  useEffect(() => {
    void check(false)
    const timer = window.setInterval(() => void check(false), POLL_MS)
    return () => window.clearInterval(timer)
  }, [check])

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = window.setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  async function resend() {
    setBusy(true)
    try {
      await api('/auth/verification-email', 'POST', { email: account.email })
      setCooldown(COOLDOWN_SECONDS)
      setNote({ key: 'verify.resent' })
    } catch (error) {
      setNote({ error }) // 節流的 429 依狀態碼翻譯，不顯示後端句子
    } finally {
      setBusy(false)
    }
  }

  const email = status?.email_masked || account.email_masked || account.email
  const noteText = note === null ? '' : 'key' in note ? t(note.key) : errorMessage(t, note.error)
  return <main className="auth-main auth-main--center">
    <section className="auth-card auth-card--wide" aria-labelledby="verify-title">
      <Screws />
      <MailIcon />
      <h1 id="verify-title">{t('verify.title')}</h1>
      <p className="auth-card__body">{t('verify.body', { email })}</p>
      <div className="auth-waiting" aria-live="polite"><span className="auth-waiting__dot" aria-hidden="true" />{t('verify.waiting')}</div>
      <div className="auth-card__actions">
        <button type="button" className="auth-button auth-button--primary" disabled={busy || cooldown > 0} onClick={() => void resend()}>
          {cooldown > 0 ? t('verify.cooldown', { seconds: cooldown }) : t('verify.resend')}
        </button>
        <button type="button" className="auth-button auth-button--quiet" onClick={() => void check(true)}>{t('verify.checked')}</button>
      </div>
      <p className="auth-card__hint">{t('verify.help')}</p>
      {status?.delivery?.preview_url && <a className="auth-card__local-preview" href={status.delivery.preview_url}>{t('verify.localPreview')}</a>}
      <p role="status" className="auth-card__note">{noteText}</p>
    </section>
  </main>
}

export function VerifyPage() {
  const { t } = useT('auth')
  const { status, account, signOut } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token')
  const next = safeNext(params.get('next'))

  const logout = account
    ? <button type="button" className="auth-header__logout" onClick={() => void signOut().then(() => navigate('/login', { replace: true }))}>{t('verify.logout')}</button>
    : null

  if (token) return <AuthLayout actions={logout}><TokenCard token={token} next={next} /></AuthLayout>
  if (status === 'loading') return <LoadingScreen />
  if (!account) return <Navigate to={'/login?next=' + encodeURIComponent('/verify' + (next === '/' ? '' : '?next=' + encodeURIComponent(next)))} replace />
  if (account.verified) return <Navigate to={next} replace />
  return <AuthLayout actions={logout}><WaitingCard next={next} /></AuthLayout>
}
