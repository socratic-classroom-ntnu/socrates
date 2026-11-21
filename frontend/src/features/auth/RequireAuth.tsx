import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useT } from '../../i18n/useT'
import { useAuth } from './AuthContext'
import { deepLink, loginPath } from '../../shared/next'
import '../../styles/auth.css'

export function LoadingScreen() {
  const { t } = useT('common')
  return <main className="auth-loading" aria-busy="true"><div className="auth-loading__pulse" /><span className="sr-only">{t('loading')}</span></main>
}

// 未登入 → 登入頁並帶著原網址；要求驗證的頁面遇到未驗證帳號 → 驗證頁（驗證完再回來）。
// 訪客沒有 Email 可驗證，後端也對開放訪客的端點直接放行，所以訪客一律通過。
export function RequireAuth({ verified = false }: { verified?: boolean }) {
  const { status, account } = useAuth()
  const { pathname, search, hash } = useLocation()
  if (status === 'loading') return <LoadingScreen />
  if (!account) return <Navigate to={loginPath(pathname, search, hash)} replace />
  if (verified && !account.verified && account.kind !== 'guest') {
    return <Navigate to={'/verify?next=' + encodeURIComponent(deepLink(pathname, search, hash))} replace />
  }
  return <Outlet />
}
