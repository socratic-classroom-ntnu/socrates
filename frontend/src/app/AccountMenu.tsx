import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Menu, type MenuItem } from '../components/Menu'
import { errorMessage } from '../i18n/errors'
import { LANGUAGE_NAMES, LOCALES } from '../i18n/locale'
import { useT } from '../i18n/useT'
import { useChangeLocale } from '../features/auth/useChangeLocale'
import { GUEST_REGISTER, RoleTag, useAccountSummary, useLogout } from './accountSummary'
import { useAuth } from '../features/auth/AuthContext'
import { avatarSrc } from '../features/account/avatarApi'

export type NavEntry = { key: string; label: string; href: string; icon: ReactNode; fullLoad?: boolean; separated?: boolean }

/**
 * S2：帳號選單（電腦側欄底部、老師手機的頂部列）。名字旁標角色（P23）。
 * 訪客（G14）：名字是暱稱、下一行是保留日期，「個人設定」換成「註冊以保留紀錄」，登出先確認（G15）。
 */
export function AccountMenu({ variant }: { variant: 'sidebar' | 'collapsed' | 'topbar' }) {
  const compact = variant !== 'sidebar'
  const { t, locale } = useT('shell')
  const { t: tg } = useT('guest')
  const { changeLocale, failure } = useChangeLocale()
  const navigate = useNavigate()
  const { name, tag, tagLabel, guest, secondLine } = useAccountSummary()
  const { account } = useAuth()
  const avatarUrl = avatarSrc(account?.avatar_url)
  const logout = useLogout()

  const language: MenuItem = {
    key: 'language',
    label: t('account.language', { name: LANGUAGE_NAMES[locale] }),
    onSelect: () => {},
    submenu: LOCALES.map(code => ({ key: code, label: LANGUAGE_NAMES[code], checked: code === locale, onSelect: () => void changeLocale(code) })),
  }
  const items: MenuItem[] = [
    guest
      ? { key: 'register', label: tg('menu.register'), onSelect: () => navigate(GUEST_REGISTER) }
      : { key: 'settings', label: t('account.settings'), onSelect: () => navigate('/account') },
    language,
    { key: 'logout', label: t('logout'), dividerBefore: true, onSelect: logout.request },
  ]

  const who = (nameClass: string) => <span className="account-menu__who">
    <span className="account-menu__name-row"><span className={nameClass}>{name}</span><RoleTag tag={tag} label={tagLabel} /></span>
    {secondLine && <span className="account-menu__email">{secondLine}</span>}
  </span>
  
  const header = <div className="account-menu__header"><Avatar name={name} size="lg" src={avatarUrl} />{who('account-menu__header-name')}</div>
  const trigger = compact
    ? <Avatar name={name} src={avatarUrl} />
    : <><Avatar name={name} src={avatarUrl} />{who('account-menu__name')}<span className="account-menu__chevron" aria-hidden="true">›</span></>


  return <div className={'account-menu' + (compact ? ' account-menu--compact' : '')}>
    <Menu
      label={t('account.menu')}
      trigger={trigger}
      items={items}
      header={header}
      align={variant === 'topbar' ? 'end' : 'start'}
      placement={variant === 'topbar' ? 'below' : 'right'}
      triggerClassName="account-menu__trigger"
    />
    {failure && <p role="alert" className="account-menu__error">{errorMessage(t, failure)}</p>}
    {logout.confirm}
  </div>
}
