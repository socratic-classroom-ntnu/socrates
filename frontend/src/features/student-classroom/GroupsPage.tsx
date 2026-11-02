import { useAuth } from '../auth/AuthContext'
import { useT } from '../../i18n/useT'
import { Home } from './StudentHome'

// 「分組課」：舊學生首頁原樣搬來。外框裡隱藏了舊首頁的頂端列，教師端的分組課管理改從這裡進。
export function GroupsPage() {
  const { t } = useT('shell')
  const { account } = useAuth()
  return <>
    <p className="groups-page__teacher"><a href="/teacher/home">{t('groups.teacherLink')}</a></p>
    <Home user={account} />
  </>
}
