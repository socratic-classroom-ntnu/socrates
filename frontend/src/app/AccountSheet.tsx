import { type ReactNode, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Dialog } from '../components/Dialog'
import { errorMessage } from '../i18n/errors'
import { LANGUAGE_NAMES, LOCALES } from '../i18n/locale'
import { useT } from '../i18n/useT'
import { useChangeLocale } from '../features/auth/useChangeLocale'
import { GUEST_LOGIN, GUEST_REGISTER, RoleTag, useAccountSummary } from './accountSummary'

const icon = (path: ReactNode) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
const ICONS = {
  settings: icon(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>),
  language: icon(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>),
  logout: icon(<path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5M10 16l-4-4 4-4M6 12h10" />),
}

/**
 * 學生手機點「我」從下方滑出的帳號面板（S2sm）：名字＋學生標籤、Email、個人設定、語言、登出。
 * 訪客（S2gm，照 G14）：訪客標籤與保留日期、說明、「註冊以保留紀錄」「已有帳號？登入」、語言、登出（先確認，G15）。
 * 登出交給外框（onLogout）：訪客的確認框要在面板關掉之後出現。
 */
export function AccountSheet({ onClose, onLogout }: { onClose(): void; onLogout(): void }) {
  const { t, locale } = useT('shell')
  const navigate = useNavigate()
  const { changeLocale, failure } = useChangeLocale()
  const { name, tag, tagLabel, guest, secondLine } = useAccountSummary()
  const [languages, setLanguages] = useState(false)

  const go = (to: string) => { onClose(); navigate(to) }

  return <Dialog title={t('account.sheet')} placement="bottom" onClose={onClose}>
      <div className="account-sheet">
        <div className="account-sheet__who">
          <Avatar name={name} size="lg" />
          <span className="account-sheet__lines">
            <span className="account-sheet__name-row"><b>{name}</b><RoleTag tag={tag} label={tagLabel} /></span>
            {secondLine && <span className="account-sheet__second">{secondLine}</span>}
          </span>
        </div>
        {guest && <div className="account-sheet__guest">
          <p>{t('account.guestNote')}</p>
          <Link className="account-sheet__register" to={GUEST_REGISTER} onClick={onClose}>{t('account.guestRegister')}</Link>
          <Link className="account-sheet__login" to={GUEST_LOGIN} onClick={onClose}>{t('account.guestLogin')}</Link>
        </div>}
        <ul className="account-sheet__items">
          {!guest && <li><button type="button" onClick={() => go('/account')}>{ICONS.settings}<span>{t('account.settings')}</span></button></li>}
          <li>
            <button type="button" aria-expanded={languages} onClick={() => setLanguages(open => !open)}>
              {ICONS.language}<span>{t('language')}</span><span className="account-sheet__value">{LANGUAGE_NAMES[locale]}</span>
              <svg className="account-sheet__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </button>
            {languages && <ul role="menu" aria-label={t('language')} className="account-sheet__languages">
              {LOCALES.map(code => <li key={code} role="none">
                <button type="button" role="menuitemradio" aria-checked={code === locale} onClick={() => void changeLocale(code)}>{LANGUAGE_NAMES[code]}</button>
              </li>)}
            </ul>}
          </li>
          <li><button type="button" onClick={() => { onClose(); onLogout() }}>{ICONS.logout}<span>{t('logout')}</span></button></li>
        </ul>
        {failure && <p role="alert" className="account-menu__error">{errorMessage(t, failure)}</p>}
      </div>
  </Dialog>
}
