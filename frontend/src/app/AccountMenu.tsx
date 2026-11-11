import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Menu, type MenuItem } from '../components/Menu'
import { errorMessage } from '../i18n/errors'
import { LANGUAGE_NAMES, LOCALES } from '../i18n/locale'
import { useT } from '../i18n/useT'
import { useAuth } from '../features/auth/AuthContext'
import { useChangeLocale } from '../features/auth/useChangeLocale'

export type NavEntry = { key: string; label: string; href: string; icon: ReactNode; fullLoad?: boolean }

/** S2: personal settings, the language submenu and logout; on phones the nav items come first. */
export function AccountMenu({ variant, navItems = [] }: { variant: 'sidebar' | 'collapsed' | 'topbar'; navItems?: NavEntry[] }) {
  const compact = variant !== 'sidebar'
  const { t, locale } = useT('shell')
  const { account, signOut } = useAuth()
  const { changeLocale, failure } = useChangeLocale()
  const navigate = useNavigate()
  const name = account?.username ?? ''
  const email = account?.email ?? ''

  const items: MenuItem[] = [
    // 和側邊欄一樣：新路由器的頁面在路由器內切換，舊教師頁（fullLoad）在 render 時讀 window.location，整頁載入。
    ...navItems.map(item => ({
      key: 'nav-' + item.key, label: item.label, icon: item.icon,
      onSelect: () => item.fullLoad ? window.location.assign(item.href) : navigate(item.href),
    })),
    { key: 'settings', label: t('account.settings'), dividerBefore: navItems.length > 0, onSelect: () => navigate('/account') },
    {
      key: 'language',
      label: t('account.language', { name: LANGUAGE_NAMES[locale] }),
      onSelect: () => {},
      submenu: LOCALES.map(code => ({ key: code, label: LANGUAGE_NAMES[code], checked: code === locale, onSelect: () => void changeLocale(code) })),
    },
    {
      key: 'logout',
      label: t('logout'),
      dividerBefore: true,
      onSelect: () => void signOut().then(() => navigate('/login', { replace: true })),
    },
  ]

  const header = <div className="account-menu__header">
    <Avatar name={name} size="lg" />
    <span className="account-menu__who"><b>{name}</b><span className="account-menu__email">{email}</span></span>
  </div>

  const trigger = compact
    ? <Avatar name={name} />
    : <><Avatar name={name} /><span className="account-menu__who"><span className="account-menu__name">{name}</span><span className="account-menu__email">{email}</span></span><span className="account-menu__chevron" aria-hidden="true">›</span></>

  return <div className={'account-menu' + (compact ? ' account-menu--compact' : '')}>
    <Menu
      label={t('account.menu')}
      trigger={trigger}
      items={items}
      header={header}
      align={variant === 'topbar' ? 'end' : 'start'}
      placement={variant === 'topbar' ? 'below' : 'above'}
      triggerClassName="account-menu__trigger"
    />
    {failure && <p role="alert" className="account-menu__error">{errorMessage(t, failure)}</p>}
  </div>
}
