import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useT } from '../../i18n/useT'
import { Home } from './StudentHome'

// 「分組課」：舊學生首頁原樣搬來。外框裡隱藏了舊首頁的頂端列，教師端的分組課管理改從這裡進。
export function GroupsPage() {
  const { t } = useT('shell')
  const { account } = useAuth()
  // 訪客沒有 Email，舊首頁會把他當成「還沒驗證」而停在寄到空白信箱的驗證閘門；分組課本來就不開放給訪客
  if (account?.kind === 'guest') return <Navigate to="/" replace />
  return <>
    {/* 教師端連結只給老師帳號（P30） */}
    {account?.account_role === 'teacher' && <p className="groups-page__teacher"><a href="/teacher/home">{t('groups.teacherLink')}</a></p>}
    <Home user={account} />
  </>
}
