import { Navigate, Outlet } from 'react-router-dom'
import { useShellBack } from '../../app/shellContext'
import { useIsPhone } from '../../app/useIsPhone'
import { useT } from '../../i18n/useT'
import { ComingSoonPage } from '../ComingSoonPage'

// 教師端不做手機版（Fizzy 決定）：手機寬度下所有 /teach/... 都換成 S4m，頁面本身不 render、不發請求。
export function TeacherDesktopOnly() {
  const phone = useIsPhone()
  return phone ? <TeacherPhoneUnsupported /> : <Outlet />
}

function TeacherPhoneUnsupported() {
  const { t } = useT('teach')
  // 頂部列用「我教的課」而不是課名：這一頁不載入課程資料
  useShellBack('/?tab=teach', t('course.breadcrumb'))
  return <ComingSoonPage
    illustration="desktopOnly"
    title={t('phone.title')}
    body={t('phone.body')}
    backTo="/?tab=teach"
    backLabel={t('phone.back')}
  />
}

/** /teach/create-course: computers open the T1 drawer on the home page; phones never get here (S4m). */
export function CreateCourseRedirect() {
  return <Navigate to="/?tab=teach&create=1" replace />
}
