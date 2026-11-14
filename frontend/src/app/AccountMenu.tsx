import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Menu, type MenuItem } from '../components/Menu'
import { errorMessage } from '../i18n/errors'
import { LANGUAGE_NAMES, LOCALES } from '../i18n/locale'
import { useT } from '../i18n/useT'
import { useChangeLocale } from '../features/auth/useChangeLocale'
import { GUEST_LOGIN, GUEST_REGISTER, RoleTag, useAccountSummary, useLogout } from './accountSummary'

export type NavEntry = { key: string; label: string; href: string; icon: ReactNode; fullLoad?: boolean }

/**
 * S2：帳號選單（電腦側欄底部、老師手機的頂部列）。名字旁標角色（P23）。
 * 訪客（G14、P34）：沒有個人設定，換成「註冊以保留紀錄」「已有帳號？登入」，登出先確認（G15）。
 */
export function AccountMenu({ variant }: { variant: 'sidebar' | 'collapsed' | 'topbar' }) {
  const compact = variant !== 'sidebar'
  const { t, locale } = useT('shell')
  const { changeLocale, failure } = useChangeLocale()
  const navigate = useNavigate()
  const { name, tag, tagLabel, guest, secondLine } = useAccountSummary()
  const logout = useLogout()

  const language: MenuItem = {
    key: 'language',
    label: t('account.language', { name: LANGUAGE_NAMES[locale] }),
    onSelect: () => {},
    submenu: LOCALES.map(code => ({ key: code, label: LANGUAGE_NAMES[code], checked: code === locale, onSelect: () => void changeLocale(code) })),
  }
  const items: MenuItem[] = [
    ...(guest
      ? [
        { key: 'guest-register', label: t('account.guestRegister'), onSelect: () => navigate(GUEST_REGISTER) },
        { key: 'guest-login', label: t('account.guestLogin'), onSelect: () => navigate(GUEST_LOGIN) },
      ]
      : [{ key: 'settings', label: t('account.settings'), onSelect: () => navigate('/account') }]),
    language,
    { key: 'logout', label: t('logout'), dividerBefore: true, onSelect: logout.request },
  ]

  const who = (nameClass: string) => <span className="account-menu__who">
    <span className="account-menu__name-row"><span className={nameClass}>{name}</span><RoleTag tag={tag} label={tagLabel} /></span>
    {secondLine && <span className="account-menu__email">{secondLine}</span>}
  </span>
  const header = <div className="account-menu__header"><Avatar name={name} size="lg" />{who('account-menu__header-name')}</div>
  const trigger = compact
    ? <Avatar name={name} />
    : <><Avatar name={name} />{who('account-menu__name')}<span className="account-menu__chevron" aria-hidden="true">›</span></>

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
    {logout.confirm}
  </div>
}
