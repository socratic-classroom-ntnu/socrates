import type { ReactNode } from 'react'
import { Avatar } from '../../components/Avatar'
import { useAuth } from './AuthContext'
import { accountName } from '../../shared/accountName'
import { useT } from '../../i18n/useT'
import { LanguageSwitcher } from './LanguageSwitcher'
import '../../styles/join.css'
import { avatarSrc } from '../../contract/accountClient'

/** J0／J1／J2m: full-screen join pages with the brand and, once signed in, the user's avatar. */
export function JoinLayout({ children, scene = false }: { children: ReactNode; scene?: boolean }) {
  const { t } = useT('common')
  const { t: tg } = useT('guest')
  const { account } = useAuth()
  return <div className={'join-page' + (scene ? ' join-page--scene' : '')}>
    {scene && <><div className="join-page__wainscot" aria-hidden="true" /><div className="join-page__floor" aria-hidden="true" /></>}
    <header className="join-page__header">
      <a className="join-page__brand" href="/"><span className="join-page__mark" aria-hidden="true">問</span>{t('brand')}</a>
      {(!account || account.kind === 'guest') && <LanguageSwitcher className="language-switcher--bare" />}
      {account?.kind === 'guest' && <span className="join-page__chip">{tg('chip')}</span>}
      {account && account.kind !== 'guest' && (<span className="join-page__user"> <Avatar name= {accountName(account)}src={avatarSrc(account)}/><span>{accountName(account)}</span></span>)}
    </header>
    <main className="join-page__main">{children}</main>
  </div>
}

/** The dark chalkboard card used by J1m and J2m. */
export function ChalkCard({ eyebrow, title, rows }: { eyebrow?: ReactNode; title: ReactNode; rows: { label: string; value: ReactNode }[] }) {
  return <section className="chalk-card">
    {eyebrow && <p className="chalk-card__eyebrow">{eyebrow}</p>}
    <h2 className="chalk-card__title">{title}</h2>
    <dl className="chalk-card__rows">
      {rows.map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
    </dl>
  </section>
}
