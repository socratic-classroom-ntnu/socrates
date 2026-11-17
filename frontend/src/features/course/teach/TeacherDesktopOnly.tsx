import { Navigate, Outlet } from 'react-router-dom'
import { useShellBack } from '../../../shared/shellContext'
import { useIsPhone } from '../../../shared/useIsPhone'
import { useT } from '../../../i18n/useT'
import { ComingSoonPage } from '../../../components/ComingSoonPage'

// 教師端不做手機版（Fizzy 決定）：手機寬度下所有 /teach/... 都換成 S4m，頁面本身不 render、不發請求。
export function TeacherDesktopOnly() {
  const phone = useIsPhone()
  return phone ? <TeacherPhoneUnsupported /> : <Outlet />
}

function TeacherPhoneUnsupported() {
  const { t } = useT('teach')
  // 頂部列回首頁：這一頁不載入課程資料，首頁也已經沒有「我教的課」分頁
  useShellBack('/', t('shell:nav.home'))
  return <ComingSoonPage
    illustration="desktopOnly"
    title={t('phone.title')}
    body={t('phone.body')}
    backTo="/"
    backLabel={t('phone.back')}
  />
}

/** /teach/create-course: computers open the T1 drawer on the home page; phones never get here (S4m). */
export function CreateCourseRedirect() {
  return <Navigate to="/?tab=teach&create=1" replace />
}
