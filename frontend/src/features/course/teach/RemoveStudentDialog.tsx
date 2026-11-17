import { useState } from 'react'
import { ApiError, api } from '../../../contract/classroomClient'
import { Dialog } from '../../../components/Dialog'
import { errorMessage } from '../../../i18n/errors'
import { useT } from '../../../i18n/useT'
import { Button, FormError } from '../../../ui'

type Props = { courseId: string; enrollmentId: string; name: string; onCancel(): void; onRemoved(): void }

/** 移出課程 (P3, P8): deletes the enrollment and every answer in the course, for good. */
export function RemoveStudentDialog({ courseId, enrollmentId, name, onCancel, onRemoved }: Props) {
  const { t } = useT('teach')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)

  async function confirm() {
    setBusy(true)
    setFailure(null)
    try {
      await api(`/courses/${courseId}/students/${enrollmentId}`, 'DELETE')
      onRemoved()
    } catch (error) {
      // 已經被移出（另一個分頁）也算完成
      if (error instanceof ApiError && error.status === 404) onRemoved()
      else setFailure(error)
    } finally {
      setBusy(false)
    }
  }

  return <Dialog
    title={t('students.removeDialog.title', { name })}
    tone="danger"
    onClose={onCancel}
    footer={<>
      <Button variant="quiet" onClick={onCancel}>{t('students.removeDialog.cancel')}</Button>
      <Button variant="danger" disabled={busy} onClick={() => void confirm()}>{t('students.removeDialog.confirm')}</Button>
    </>}
  >
    <p className="dialog__text">{t('students.removeDialog.body')}</p>
    {failure && <FormError role="alert">{errorMessage(t, failure)}</FormError>}
  </Dialog>
}
