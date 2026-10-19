import { LegacyStudentHome } from '../../ClassroomApp'
import { useT } from '../../i18n/useT'

// 「分組課」：舊學生首頁原樣搬來。M1 在外框裡隱藏了舊首頁的頂端列，教師端的分組課管理改從這裡進。
export function GroupsPage() {
  const { t } = useT('shell')
  return <>
    <p className="groups-page__teacher"><a href="/teacher/home">{t('groups.teacherLink')}</a></p>
    <LegacyStudentHome />
  </>
}
