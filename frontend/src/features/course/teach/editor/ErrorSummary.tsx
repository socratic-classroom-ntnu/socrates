import { useT } from '../../../../i18n/useT'

/** T3E（11/08 改）：頂端只說一句有欄位沒填好；每個欄位的錯誤在欄位底下，送出時畫面跳到第一個。 */
export function ErrorSummary() {
  const { t } = useT('editor')
  return <section role="alert" className="error-summary">
    <h2>{t('errors.summary')}</h2>
  </section>
}
