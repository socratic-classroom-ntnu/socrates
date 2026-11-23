import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useT } from '../i18n/useT'
import '../styles/app-shell.css'
import { useAuth } from '../features/auth/AuthContext'
import { Avatar } from '../components/Avatar'
import { BottomNav } from '../ui'
import { AccountMenu, type NavEntry } from './AccountMenu'
import { AccountSheet } from './AccountSheet'
import { useLogout } from './accountSummary'
import { InsideAppShell, type ShellActive, ShellActiveContext, type ShellBack, ShellBackContext } from '../shared/shellContext'
import { useFeatures } from '../shared/publicConfig'
import { useIsPhone } from '../shared/useIsPhone'

type NavKey = 'home' | 'dialogues' | 'groups' | 'bank' | 'store' | 'settings' | 'admin'

const icon = (path: ReactNode) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>

// 新路由器的頁面在路由器內切換；整頁重載會先露出深色底與載入畫面，看起來像黑屏閃一下。
// 舊教師頁（/teacher/home?view=…）在 render 時讀 window.location 決定畫面，仍用一般連結整頁載入（fullLoad）。
const ITEMS: { key: NavKey; href: string; icon: ReactNode; fullLoad?: true }[] = [
  { key: 'home', href: '/', icon: icon(<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />) },
  { key: 'dialogues', href: '/my-dialogues', icon: icon(<><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></>) },
  { key: 'groups', href: '/groups', icon: icon(<><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20a6 6 0 0 1 12 0M14 20a4.5 4.5 0 0 1 7-3.7" /></>) },
  { key: 'bank', href: '/teacher/home?view=bank', fullLoad: true, icon: icon(<path d="M4 4v16M9 4v16M14 4l5 16" />) },
  { key: 'store', href: '/teacher/home?view=store', fullLoad: true, icon: icon(<><path d="M4 9l1.5-5h13L20 9" /><path d="M4 9h16v11H4z" /><path d="M9 20v-6h6v6" /></>) },
  { key: 'settings', href: '/teach/ai-settings', icon: icon(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>) },
]

// 帳號只有一個角色（P22）：側欄依角色。「分組課」只給老師，而且要多人模式開著（後台開關，Fizzy 11/18）；
// 開關還沒讀到或讀取失敗都不顯示，跟 GroupModeGate 一致。學生進分組教室靠加入碼或連結，沒有入口。
// 訪客的角色一律是學生，側欄跟學生一樣：「我的對話」點進去是註冊後才能使用的說明頁。
const NAV_BY_ROLE: Record<'student' | 'teacher', NavKey[]> = {
  student: ['home', 'dialogues'],
  teacher: ['home', 'groups', 'bank', 'store', 'settings'],
}

const ADMIN_ICON = icon(<><path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></>)

const COLLAPSED_KEY = 'socrates.shell.collapsed'

function readCollapsed(): boolean {
  try { return localStorage.getItem(COLLAPSED_KEY) === 'true' } catch { return false }
}

function writeCollapsed(value: boolean): void {
  try { localStorage.setItem(COLLAPSED_KEY, String(value)) } catch { /* per-viewer convenience only */ }
}

export function activeItem(pathname: string, search: string): NavKey | null {
  if (/^\/admin(\/|$)/.test(pathname)) return 'admin'
  if (/^\/my-dialogues\/?$/.test(pathname)) return 'dialogues'
  if (/^\/teach\/ai-settings\/?$/.test(pathname)) return 'settings'
  if (pathname === '/' || pathname.startsWith('/learn/') || pathname.startsWith('/teach/')) return 'home'
  if (/^\/groups\/?$/.test(pathname) || pathname.startsWith('/teacher/courses/')) return 'groups'
  if (/^\/teacher\/home\/?$/.test(pathname)) {
    // 沒有 ?view= 的舊教師首頁就是多人課程首頁
    const view = new URLSearchParams(search).get('view')
    return view === 'bank' || view === 'store' || view === 'settings' ? view : 'groups'
  }
  return null
}

/** children：不經路由、直接包一頁進外框（跨角色說明頁）；沒有就是路由的 Outlet。 */
export function AppShell({ children }: { children?: ReactNode } = {}) {
  const { t } = useT('shell')
  const { account } = useAuth()
  const { pathname, search } = useLocation()
  const phone = useIsPhone()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [back, setBack] = useState<ShellBack>(null)
  // 直接包進來的一頁（跨角色說明頁）不屬於任何導覽項目，不標目前頁
  // 頁面宣告的優先（例如我的對話的私人活動頁），否則依網址
  const [declared, setDeclared] = useState<ShellActive>(null)
  const active = children ? null : declared ?? activeItem(pathname, search)
  const { status: featuresStatus, features } = useFeatures()
  const role = account?.account_role === 'teacher' ? 'teacher' : 'student'
  const groupsOpen = featuresStatus === 'ready' && features.group_mode
  const navItems: NavEntry[] = ITEMS
    .filter(item => NAV_BY_ROLE[role].includes(item.key) && (item.key !== 'groups' || groupsOpen))
    .map(item => ({ key: item.key, label: t(`nav.${item.key}`), href: item.href, icon: item.icon, fullLoad: item.fullLoad }))
  // 平台管理員（老師或學生都可能）在一般項目下方多一個「後台」（Figma AD1、AD2；手機不加，後台只做電腦版）
  if (account?.is_admin) navItems.push({ key: 'admin', label: t('nav.admin'), href: '/admin', icon: ADMIN_ICON, separated: true })

  function toggleCollapsed() {
    setCollapsed(value => { writeCollapsed(!value); return !value })
  }

  const content = <div className="app-shell__content" id="app-content">
    <ShellActiveContext.Provider value={setDeclared}>
    <ShellBackContext.Provider value={setBack}>
      <InsideAppShell.Provider value={true}>{children ?? <Outlet />}</InsideAppShell.Provider>
    </ShellBackContext.Provider>
    </ShellActiveContext.Provider>
  </div>

  if (phone) {
    // 頂部列：內頁是「返回＋頁名」，其他頁是標誌（S5m）
    const top = back
      ? <Link className="app-shell__back" to={back.to}><span aria-hidden="true">‹</span>{back.label}</Link>
      : <Link className="app-shell__brand" to="/"><span className="app-shell__mark" aria-hidden="true">問</span>{t('common:brand')}</Link>
    // 老師手機不變（P29）：頂部列＋頭像選單；畫布 RoleTeacherPhoneMenu 的選單裡沒有導覽項目
    if (role === 'teacher') {
      return <div className="app-shell app-shell--phone">
        <a className="app-shell__skip" href="#app-content">{t('skip')}</a>
        <header className="app-shell__topbar">{top}<AccountMenu variant="topbar" /></header>
        {content}
      </div>
    }
    return <StudentPhoneShell top={top} active={active} name={account?.username ?? ''}>{content}</StudentPhoneShell>
  }

  return <div className={'app-shell' + (collapsed ? ' app-shell--collapsed' : '')}>
    <a className="app-shell__skip" href="#app-content">{t('skip')}</a>
    <nav className="app-shell__nav" aria-label={t('nav.label')}>
      <Link className="app-shell__brand" to="/" aria-label={collapsed ? t('common:brand') : undefined}>
        <span className="app-shell__mark" aria-hidden="true">問</span>
        {!collapsed && t('common:brand')}
      </Link>
      <ul className="app-shell__items">
        {navItems.map(item => {
          const props = {
            'aria-current': active === item.key ? 'page' as const : undefined,
            'aria-label': collapsed ? item.label : undefined,
            title: collapsed ? item.label : undefined,
          }
          const body = <>{item.icon}{!collapsed && item.label}</>
          return <li key={item.key} className={item.separated ? 'app-shell__separated' : undefined}>
            {item.fullLoad ? <a href={item.href} {...props}>{body}</a> : <Link to={item.href} {...props}>{body}</Link>}
          </li>
        })}
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

/**
 * 學生手機（P24–P26）：頂部列沒有頭像；最下方底部導覽「首頁」「我」（「我的對話」那格由另一份需求加），
 * 頭像移到「我」，點了從下方滑出帳號面板。對話頁不在外框裡，所以沒有底部導覽。
 */
function StudentPhoneShell({ top, active, name, children }: { top: ReactNode; active: NavKey | null; name: string; children: ReactNode }) {
  const { t } = useT('shell')
  const [sheet, setSheet] = useState(false)
  const logout = useLogout()
  const typing = useTyping()
  const me = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  // 面板關掉後焦點回到「我」：Dialog 會還給打開它時的焦點，但 iOS Safari 點按鈕不會讓按鈕取得焦點
  useEffect(() => {
    if (wasOpen.current && !sheet && !logout.confirm) me.current?.focus()
    wasOpen.current = sheet
  }, [sheet, logout.confirm])
  return <div className="app-shell app-shell--phone app-shell--bottom-nav">
    <a className="app-shell__skip" href="#app-content">{t('skip')}</a>
    <header className="app-shell__topbar">{top}</header>
    {children}
    {!typing && <BottomNav label={t('nav.label')} className="app-shell__bottom-nav" items={[
      { key: 'home', label: t('nav.home'), icon: ITEMS[0].icon, to: '/', current: active === 'home' },
      { key: 'dialogues', label: t('nav.dialogues'), icon: ITEMS[1].icon, to: '/my-dialogues', current: active === 'dialogues' },
      { key: 'me', label: t('nav.me'), icon: <Avatar name={name} />, onSelect: () => setSheet(open => !open), expanded: sheet, buttonRef: me },
    ]} />}
    {sheet && <AccountSheet onClose={() => setSheet(false)} onLogout={logout.request} />}
    {logout.confirm}
  </div>
}

const NOT_TYPED = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'])

/** 頁面內的文字輸入框有焦點時為 true：底部導覽這時藏起來，Android 鍵盤會把固定在底部的元素頂上來（P25）。 */
function isText(target: EventTarget | null): boolean {
  return target instanceof HTMLTextAreaElement
    || (target instanceof HTMLInputElement && !NOT_TYPED.has(target.type))
    || (target instanceof HTMLElement && target.isContentEditable)
}

function useTyping(): boolean {
  const [typing, setTyping] = useState(false)
  const { pathname } = useLocation()
  // 換頁時聚焦中的欄位直接被移除，瀏覽器不一定會發 focusout：換頁後重新看一次焦點在哪
  useEffect(() => { setTyping(isText(document.activeElement)) }, [pathname])
  useEffect(() => {
    const onIn = (event: FocusEvent) => setTyping(isText(event.target))
    const onOut = () => setTyping(false)
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    return () => {
      document.removeEventListener('focusin', onIn)
      document.removeEventListener('focusout', onOut)
    }
  }, [])
  return typing
}
