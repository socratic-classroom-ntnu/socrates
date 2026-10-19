import type { ReactNode } from 'react'
import { LanguageSwitcher } from '../../app/LanguageSwitcher'
import { useT } from '../../i18n/useT'
import '../../styles/auth.css'

// E1／E2 共用的教室走廊背景：牆面、木頭護牆板、地板，加上品牌與語言切換。
export function AuthLayout({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const { t } = useT('common')
  return <div className="auth-scene">
    <div className="auth-scene__wainscot" aria-hidden="true" />
    <div className="auth-scene__floor" aria-hidden="true" />
    <header className="auth-header">
      <span className="auth-brand"><span className="auth-brand__mark" aria-hidden="true">問</span>{t('brand')}</span>
      <span className="auth-header__actions"><LanguageSwitcher />{actions}</span>
    </header>
    {children}
  </div>
}

export function Screws() {
  return <>{['tl', 'tr', 'bl', 'br'].map(corner => <span key={corner} className={'auth-card__screw auth-card__screw--' + corner} aria-hidden="true" />)}</>
}
