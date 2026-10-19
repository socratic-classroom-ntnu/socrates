import type { ReactNode } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useT } from '../i18n/useT'
import '../styles/app-shell.css'
import { useAuth } from './AuthContext'
import { LanguageSwitcher } from './LanguageSwitcher'
import { InsideAppShell } from './shellContext'

type NavKey = 'home' | 'teaching' | 'bank' | 'store' | 'settings'

const icon = (path: ReactNode) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>

// 舊頁仍讀 window.location 決定畫面，所以導覽用一般連結整頁載入，與舊 TeacherShell 相同。
const ITEMS: { key: NavKey; href: string; icon: ReactNode }[] = [
  { key: 'home', href: '/', icon: icon(<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />) },
  { key: 'teaching', href: '/teacher/home', icon: icon(<path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2zM22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z" />) },
  { key: 'bank', href: '/teacher/home?view=bank', icon: icon(<path d="M4 4v16M9 4v16M14 4l5 16" />) },
  { key: 'store', href: '/teacher/home?view=store', icon: icon(<><path d="M4 9l1.5-5h13L20 9" /><path d="M4 9h16v11H4z" /><path d="M9 20v-6h6v6" /></>) },
  { key: 'settings', href: '/teacher/home?view=settings', icon: icon(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>) },
]

export function activeItem(pathname: string, search: string): NavKey | null {
  if (pathname === '/') return 'home'
  if (pathname.startsWith('/teacher/courses/')) return 'teaching'
  if (/^\/teacher\/home\/?$/.test(pathname)) {
    const view = new URLSearchParams(search).get('view')
    return view === 'bank' || view === 'store' || view === 'settings' ? view : 'teaching'
  }
  return null
}

export function AppShell() {
  const { t } = useT('shell')
  const { account, signOut } = useAuth()
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const active = activeItem(pathname, search)

  async function logout() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return <div className="app-shell">
    <a className="app-shell__skip" href="#app-content">{t('skip')}</a>
    <nav className="app-shell__nav" aria-label={t('nav.label')}>
      <a className="app-shell__brand" href="/"><span className="app-shell__mark" aria-hidden="true">問</span>{t('common:brand')}</a>
      <ul className="app-shell__items">
        {ITEMS.map(item => <li key={item.key}>
          <a href={item.href} aria-current={active === item.key ? 'page' : undefined}>{item.icon}{t(`nav.${item.key}`)}</a>
        </li>)}
      </ul>
      <div className="app-shell__footer">
        <LanguageSwitcher className="app-shell__language" />
        <div className="app-shell__user">
          <span className="app-shell__avatar" aria-hidden="true">{account?.username.slice(0, 1).toUpperCase()}</span>
          <span className="app-shell__name">{account?.username}</span>
          <button type="button" className="app-shell__logout" onClick={() => void logout()}>{t('logout')}</button>
        </div>
      </div>
    </nav>
    <div className="app-shell__content" id="app-content">
      <InsideAppShell.Provider value={true}><Outlet /></InsideAppShell.Provider>
    </div>
  </div>
}
