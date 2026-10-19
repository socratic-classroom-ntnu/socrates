import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useT } from '../i18n/useT'
import { useAuth } from './AuthContext'
import { deepLink, loginPath } from './next'

export function LoadingScreen() {
  const { t } = useT('common')
  return <main className="sc-loading" aria-busy="true"><div className="sc-pulse" /><span className="sr-only">{t('loading')}</span></main>
}

// 未登入 → 登入頁並帶著原網址；要求驗證的頁面遇到未驗證帳號 → 驗證頁（驗證完再回來）。
export function RequireAuth({ verified = false }: { verified?: boolean }) {
  const { status, account } = useAuth()
  const { pathname, search, hash } = useLocation()
  if (status === 'loading') return <LoadingScreen />
  if (!account) return <Navigate to={loginPath(pathname, search, hash)} replace />
  if (verified && !account.verified) {
    return <Navigate to={'/verify?next=' + encodeURIComponent(deepLink(pathname, search, hash))} replace />
  }
  return <Outlet />
}
