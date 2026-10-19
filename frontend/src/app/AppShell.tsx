import { type ReactNode, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useT } from '../i18n/useT'
import '../styles/app-shell.css'
import { AccountMenu, type NavEntry } from './AccountMenu'
import { InsideAppShell, type ShellBack, ShellBackContext } from './shellContext'
import { useIsPhone } from './useIsPhone'

type NavKey = 'home' | 'groups' | 'bank' | 'store' | 'settings'

const icon = (path: ReactNode) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>

// 舊頁仍讀 window.location 決定畫面，所以導覽用一般連結整頁載入，與舊 TeacherShell 相同。
const ITEMS: { key: NavKey; href: string; icon: ReactNode }[] = [
  { key: 'home', href: '/', icon: icon(<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />) },
  { key: 'groups', href: '/groups', icon: icon(<><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20a6 6 0 0 1 12 0M14 20a4.5 4.5 0 0 1 7-3.7" /></>) },
  { key: 'bank', href: '/teacher/home?view=bank', icon: icon(<path d="M4 4v16M9 4v16M14 4l5 16" />) },
  { key: 'store', href: '/teacher/home?view=store', icon: icon(<><path d="M4 9l1.5-5h13L20 9" /><path d="M4 9h16v11H4z" /><path d="M9 20v-6h6v6" /></>) },
  { key: 'settings', href: '/teacher/home?view=settings', icon: icon(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>) },
]

const COLLAPSED_KEY = 'socrates.shell.collapsed'

function readCollapsed(): boolean {
  try { return localStorage.getItem(COLLAPSED_KEY) === 'true' } catch { return false }
}

function writeCollapsed(value: boolean): void {
  try { localStorage.setItem(COLLAPSED_KEY, String(value)) } catch { /* per-viewer convenience only */ }
}

export function activeItem(pathname: string, search: string): NavKey | null {
  if (pathname === '/' || pathname.startsWith('/learn/') || pathname.startsWith('/teach/')) return 'home'
  if (pathname === '/groups' || pathname.startsWith('/teacher/courses/')) return 'groups'
  if (/^\/teacher\/home\/?$/.test(pathname)) {
    const view = new URLSearchParams(search).get('view')
    return view === 'bank' || view === 'store' || view === 'settings' ? view : 'groups'
  }
  return null
}

export function AppShell() {
  const { t } = useT('shell')
  const { pathname, search } = useLocation()
  const phone = useIsPhone()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [back, setBack] = useState<ShellBack>(null)
  const active = activeItem(pathname, search)
  const navItems: NavEntry[] = ITEMS.map(item => ({ key: item.key, label: t(`nav.${item.key}`), href: item.href, icon: item.icon }))

  function toggleCollapsed() {
    setCollapsed(value => { writeCollapsed(!value); return !value })
  }

  const content = <div className="app-shell__content" id="app-content">
    <ShellBackContext.Provider value={setBack}>
      <InsideAppShell.Provider value={true}><Outlet /></InsideAppShell.Provider>
    </ShellBackContext.Provider>
  </div>

  if (phone) {
    return <div className="app-shell app-shell--phone">
      <a className="app-shell__skip" href="#app-content">{t('skip')}</a>
      <header className="app-shell__topbar">
        {back
          ? <Link className="app-shell__back" to={back.to}><span aria-hidden="true">‹</span>{back.label}</Link>
          : <a className="app-shell__brand" href="/"><span className="app-shell__mark" aria-hidden="true">問</span>{t('common:brand')}</a>}
        <AccountMenu variant="topbar" navItems={navItems} />
      </header>
      {content}
    </div>
  }

  return <div className={'app-shell' + (collapsed ? ' app-shell--collapsed' : '')}>
    <a className="app-shell__skip" href="#app-content">{t('skip')}</a>
    <nav className="app-shell__nav" aria-label={t('nav.label')}>
      <a className="app-shell__brand" href="/" aria-label={collapsed ? t('common:brand') : undefined}>
        <span className="app-shell__mark" aria-hidden="true">問</span>
        {!collapsed && t('common:brand')}
      </a>
      <ul className="app-shell__items">
        {navItems.map(item => <li key={item.key}>
          <a
            href={item.href}
            aria-current={active === item.key ? 'page' : undefined}
            aria-label={collapsed ? item.label : undefined}
            title={collapsed ? item.label : undefined}
          >{item.icon}{!collapsed && item.label}</a>
        </li>)}
      </ul>
      <div className="app-shell__footer">
        <AccountMenu variant={collapsed ? 'collapsed' : 'sidebar'} />
        <button
          type="button"
          className="app-shell__collapse"
          onClick={toggleCollapsed}
          aria-label={collapsed ? t('expand') : undefined}
          title={collapsed ? t('expand') : undefined}
        >
          {icon(collapsed ? <path d="M4 6h16M4 12h10M4 18h16M17 9l3 3-3 3" /> : <path d="M4 6h16M10 12h10M4 18h16M7 9l-3 3 3 3" />)}
          {!collapsed && t('collapse')}
        </button>
      </div>
    </nav>
    {content}
  </div>
}
