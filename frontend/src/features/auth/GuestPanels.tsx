import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Dialog } from '../../components/Dialog'
import { useT } from '../../i18n/useT'
import { Button, ButtonLink } from '../../ui'
import type { Account } from './AuthContext'
import { guestKeepUntil } from './guestExpiry'

// G26 shows once on home after a guest who registered has verified their email.
export const UPGRADED_KEY = 'socrates.guest.upgraded'

export function markUpgraded(): void {
  try { localStorage.setItem(UPGRADED_KEY, '1') } catch { /* the notice is a convenience */ }
}

function takeUpgraded(): boolean {
  try { return localStorage.getItem(UPGRADED_KEY) === '1' } catch { return false }
}

function clearUpgraded(): void {
  try { localStorage.removeItem(UPGRADED_KEY) } catch { /* the notice is a convenience */ }
}

/** 「紀錄保留到 ○/○」 for this guest, in the current language and the browser's time zone. */
export function useKeepUntil(account: Account | null) {
  const { locale } = useT('guest')
  if (!account || account.kind !== 'guest' || !account.guest_expires_at) return null
  return guestKeepUntil(account.guest_expires_at, locale)
}

/** Home (04／G13, G25, G26): the guest reminder, and the notices after merging or verifying. */
export function GuestHomeNotices({ account }: { account: Account | null }) {
  const { t } = useT('guest')
  const [params, setParams] = useSearchParams()
  const [upgraded, setUpgraded] = useState(takeUpgraded)
  const keep = useKeepUntil(account)
  const merged = params.get('merged') === '1'
  const showUpgraded = upgraded && account?.kind === 'registered' && account.verified

  function dismissMerged() {
    const copy = new URLSearchParams(params)
    copy.delete('merged')
    setParams(copy, { replace: true })
  }

  return <>
    {merged && <p className="home-notice home-notice--done" role="status">
      {t('home.merged')}
      <button type="button" className="home-notice__dismiss" onClick={dismissMerged}>{t('home.dismiss')}</button>
    </p>}
    {showUpgraded && <p className="home-notice home-notice--done" role="status">
      {t('home.upgraded')}
      <button type="button" className="home-notice__dismiss" onClick={() => { clearUpgraded(); setUpgraded(false) }}>{t('home.dismiss')}</button>
    </p>}
    {keep && <section className={'guest-card' + (keep.lastDay ? ' guest-card--last' : '')} aria-labelledby="guest-card-title">
      <div>
        <h2 id="guest-card-title">{t(keep.lastDay ? 'home.lastTitle' : 'home.title')}</h2>
        <p>{keep.lastDay ? t('home.lastBody') : t('home.body', { date: keep.date })}</p>
      </div>
      <div className="guest-card__actions">
        <ButtonLink variant="primary" to="/guest/register">{t('home.register')}</ButtonLink>
        <Link className="join-link" to="/guest/login">{t('home.login')}</Link>
      </div>
    </section>}
  </>
}

/** Logging out as a guest: a guest who logs out cannot come back, so they confirm first; × keeps them where they are. */
export function GuestLogoutDialog({ date, onClose, onLogout }: { date: string; onClose(): void; onLogout(): void }) {
  const { t } = useT('guest')
  const navigate = useNavigate()
  return <Dialog
    title={t('logout.title')}
    description={t('logout.body', { date })}
    onClose={onClose}
    footer={<>
      <Button variant="outline" onClick={onLogout}>{t('logout.confirm')}</Button>
      <Button variant="primary" data-autofocus onClick={() => { onClose(); navigate('/guest/register') }}>{t('logout.register')}</Button>
    </>}
  >{null}</Dialog>
}

/** Closed to guests: a guest scanned a course or activity that does not take guests. Registering or
 * logging in keeps `next`, so they come back to this join afterwards; home changes nothing. */
export function GuestClosedCard({ kind, next, account }: { kind: 'course' | 'activity'; next: string; account: Account }) {
  const { t } = useT('guest')
  const keep = useKeepUntil(account)
  const back = encodeURIComponent(next)
  return <section className="join-message guest-closed">
    <h1>{t(kind === 'course' ? 'closed.courseTitle' : 'closed.activityTitle')}</h1>
    <p className="join-notice">{t('closed.body', { date: keep?.date ?? '' })}</p>
    <div className="guest-closed__actions">
      <ButtonLink variant="primary" to={'/guest/register?next=' + back}>{t('closed.register')}</ButtonLink>
      <ButtonLink variant="outline" to={'/guest/login?next=' + back}>{t('closed.login')}</ButtonLink>
      <Link className="join-link" to="/">{t('closed.home')}</Link>
    </div>
  </section>
}
