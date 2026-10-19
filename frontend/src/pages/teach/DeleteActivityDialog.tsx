import { useState } from 'react'
import { ApiError, api } from '../../api/classroomClient'
import { Dialog } from '../../components/Dialog'
import { errorMessage } from '../../i18n/errors'
import { useT } from '../../i18n/useT'

type Props = { title: string; activityId: string; onCancel(): void; onDeleted(): void }

/** T4b. Deleting is a soft delete, so the copy never promises the data is gone for good. */
export function DeleteActivityDialog({ title, activityId, onCancel, onDeleted }: Props) {
  const { t } = useT('teach')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)

  async function confirm() {
    setBusy(true)
    setFailure(null)
    try {
      await api(`/activities/${activityId}`, 'DELETE')
      onDeleted()
    } catch (error) {
      // 已經被刪掉（另一個分頁）也算完成
      if (error instanceof ApiError && error.status === 404) onDeleted()
      else setFailure(error)
    } finally {
      setBusy(false)
    }
  }

  return <Dialog
    title={t('cards.deleteDialog.title')}
    tone="danger"
    onClose={onCancel}
    footer={<>
      <button type="button" className="button button--quiet" onClick={onCancel}>{t('cards.cancel')}</button>
      <button type="button" className="button button--danger" disabled={busy} onClick={() => void confirm()}>{t('cards.deleteDialog.confirm')}</button>
    </>}
  >
    <p className="dialog__question">{t('cards.deleteDialog.question', { title })}</p>
    <p className="dialog__text">{t('cards.deleteDialog.body')}</p>
    {failure && <p role="alert" className="form-error">{errorMessage(t, failure)}</p>}
  </Dialog>
}
