import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Dialog } from '../../components/Dialog'
import { useT } from '../../i18n/useT'
import { Button, ButtonLink } from '../../ui'
import type { Account } from './AuthContext'
import { accountName } from '../../shared/accountName'
import { guestKeepUntil } from './guestExpiry'
import { JoinLoginBanner } from './JoinLoginCard'

// G25 (records merged at login) and G26 (email verified after registering) show once on home, and only to the
// account they were left for: another account logging in on the same device never sees them. One notice waits at
// a time; a newer one replaces it.
export const HOME_NOTICE_KEY = 'socrates.guest.homeNotice'

type HomeNotice = { kind: 'merged' | 'upgraded'; accountId: string }

export function leaveHomeNotice(kind: HomeNotice['kind'], accountId: string): void {
  try { localStorage.setItem(HOME_NOTICE_KEY, JSON.stringify({ kind, accountId })) } catch { /* the notice is a convenience */ }
}

function readHomeNotice(): HomeNotice | null {
  try {
    const value = JSON.parse(localStorage.getItem(HOME_NOTICE_KEY) ?? 'null') as Partial<HomeNotice> | null
    return (value?.kind === 'merged' || value?.kind === 'upgraded') && typeof value.accountId === 'string'
      ? { kind: value.kind, accountId: value.accountId } : null
  } catch { return null }
}

function clearHomeNotice(): void {
  try { localStorage.removeItem(HOME_NOTICE_KEY) } catch { /* the notice is a convenience */ }
}

/** 「紀錄保留到 ○/○」 for this guest, in the current language and the browser's time zone. */
export function useKeepUntil(account: Account | null) {
  const { locale } = useT('guest')
  if (!account || account.kind !== 'guest' || !account.guest_expires_at) return null
  return guestKeepUntil(account.guest_expires_at, locale)
}

/** Home (04／G13, G25, G26): the guest reminder, and the one notice left after merging or verifying. */
export function GuestHomeNotices({ account }: { account: Account | null }) {
  const { t } = useT('guest')
  const [notice, setNotice] = useState(readHomeNotice)
  const keep = useKeepUntil(account)
  const someoneElse = !!notice && !!account && notice.accountId !== account.id

  useEffect(() => {
    if (someoneElse) { clearHomeNotice(); setNotice(null) }
  }, [someoneElse])

  const mine = notice && account && notice.accountId === account.id ? notice.kind : null
  const shown = mine === 'merged' || (mine === 'upgraded' && account?.kind === 'registered' && account.verified) ? mine : null

  return <>
    {shown && <p className="home-notice home-notice--done" role="status">
      {t(shown === 'merged' ? 'home.merged' : 'home.upgraded')}
      <button type="button" className="home-notice__dismiss" onClick={() => { clearHomeNotice(); setNotice(null) }}>{t('home.dismiss')}</button>
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

/** Logging out as a guest: a guest who logs out cannot come back, so they confirm first; × keeps them where they are.
 * Registering comes first and is the main button (G15). */
export function GuestLogoutDialog({ onClose, onLogout }: { date?: string; onClose(): void; onLogout(): void }) {
  const { t } = useT('guest')
  const navigate = useNavigate()
  return <Dialog
    title={t('logout.title')}
    description={t('logout.body')}
    onClose={onClose}
    footer={<div className="guest-logout__actions">
      <Button variant="primary" data-autofocus onClick={() => { onClose(); navigate('/guest/register') }}>{t('logout.register')}</Button>
      <Button variant="outline" className="guest-logout__leave" onClick={onLogout}>{t('logout.confirm')}</Button>
    </div>}
  >{null}</Dialog>
}

/** Closed to guests: a guest scanned a course or activity that does not take guests (G27 / G28). Registering or
 * logging in keeps `next`, so they come back to this join afterwards; home changes nothing. */
export function GuestClosedCard({ kind, next, account, courseName, activityTitle = null }: {
  kind: 'course' | 'activity'; next: string; account: Account; courseName: string; activityTitle?: string | null
}) {
  const { t } = useT('guest')
  const keep = useKeepUntil(account)
  const back = encodeURIComponent(next)
  return <div className="join-login">
    <JoinLoginBanner courseName={courseName} kind={kind} activityTitle={activityTitle} />
    <section className="join-login__card">
      <h1>{t(kind === 'course' ? 'closed.courseTitle' : 'closed.activityTitle')}</h1>
      <p className="join-login__lead">{t(kind === 'course' ? 'closed.bodyCourse' : 'closed.bodyActivity', { name: courseName })}</p>
      {keep && <p className="join-alert join-alert--info">{t('closed.keep', { date: keep.date })}</p>}
      <ButtonLink variant="primary" className="join-login__submit" to={'/guest/register?next=' + back}>{t('closed.register')}</ButtonLink>
      <ButtonLink variant="outline" className="join-login__submit" to="/">{t('closed.home')}</ButtonLink>
      <p className="join-login__after"><Link className="join-link join-link--inline" to={'/guest/login?next=' + back}>{t('closed.login')}</Link></p>
    </section>
    <p className="join-login__note">{t('closed.who', { name: accountName(account) })}</p>
  </div>
}
