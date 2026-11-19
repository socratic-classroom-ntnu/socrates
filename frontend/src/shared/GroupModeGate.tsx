import type { ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { ComingSoonPage } from '../components/ComingSoonPage'
import { useT } from '../i18n/useT'
import { useFeatures } from './publicConfig'

/**
 * 包住所有多人模式的頁面（後台 spec P8、P19、P20、P26）：讀取設定時不掛載頁面（不會先打 API 或開
 * WebSocket），多人模式關閉時顯示「多人模式目前沒有開放」。舊路由底下不屬於多人模式的畫面照常放行。
 */
export function groupModeAllowed(pathname: string, search: string): boolean {
  const view = new URLSearchParams(search).get('view')
  if (/^\/groups\/?$/.test(pathname)) return view === 'providers'
  if (/^\/teacher\/home\/?$/.test(pathname)) return view === 'bank' || view === 'store' || view === 'settings'
  return false
}

/** `loading` 由 app 層傳入系統的載入畫面（platform 不能 import auth）。 */
export function GroupModeGate({ loading }: { loading?: ReactNode } = {}) {
  const { t } = useT('common')
  const { status, features } = useFeatures()
  const { pathname, search } = useLocation()
  if (groupModeAllowed(pathname, search)) return <Outlet />
  if (status === 'loading') return loading ?? <main className="placeholder-page" aria-busy="true"><p>{t('loading')}</p></main>
  if (!features.group_mode) return <ComingSoonPage title={t('groupModeOff.title')} body={t('groupModeOff.body')} />
  return <Outlet />
}
