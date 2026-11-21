import { Outlet } from 'react-router-dom'
import { NotFoundPage } from '../../components/ComingSoonPage'
import { useT } from '../../i18n/useT'
import { useAuth } from '../auth/AuthContext'

/**
 * 後台只給平台管理員（後台 spec P15）：不經 RequireAuth，未登入、訪客、未驗證、一般帳號一律看到
 * 「找不到這個頁面」，不會被導去登入頁。
 */
export function AdminGate() {
  const { t } = useT('common')
  const { status, account } = useAuth()
  if (status === 'loading') return <main className="placeholder-page" aria-busy="true"><p>{t('loading')}</p></main>
  const admin = status === 'ready' && account?.kind === 'registered' && account.verified && account.is_admin === true
  return admin ? <Outlet /> : <NotFoundPage />
}
