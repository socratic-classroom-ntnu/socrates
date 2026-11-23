import { useState, type FormEvent } from 'react'
import { ApiError, api } from '../../contract/classroomClient'
import { useT } from '../../i18n/useT'
import { Button, Field, FieldError, FormError, PasswordInput, describedBy } from '../../ui'
import { AccountFrame, type FrameVariant } from './AccountFrame'
import { PasswordRules } from './PasswordRules'
import { passwordRulesPass } from './passwordChecks'
import styles from './ChangePasswordDialog.module.css'

type Props = {
  /** 電腦版是對話框，手機是 /account/password 內頁（Figma M10–M12） */
  variant?: FrameVariant
  onClose: () => void
  onSuccess: () => void
}

type FormFailure = '' | 'rateLimited' | 'unavailable' | 'failure'

const FORM_ID = 'change-password-form'

/** 422 裡有沒有新密碼欄位的錯誤（FastAPI 的 detail 是 [{ loc, type, msg, input }]）。 */
function rejectsNewPassword(detail: unknown): boolean {
  return Array.isArray(detail) && detail.some(issue => {
    const loc = issue && typeof issue === 'object' ? (issue as { loc?: unknown }).loc : undefined
    return Array.isArray(loc) && loc[loc.length - 1] === 'new_password'
  })
}

export function ChangePasswordDialog({ variant = 'dialog', onClose, onSuccess }: Props) {
  const { t } = useT('shell')
  const tr = (key: string) => t(`accountSettings.passwordDialog.${key}`)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [currentWrong, setCurrentWrong] = useState(false)
  const [newRejected, setNewRejected] = useState(false)
  const [failure, setFailure] = useState<FormFailure>('')
  const [busy, setBusy] = useState(false)

  const mismatch = confirmPassword !== '' && confirmPassword !== newPassword
  const ready = currentPassword !== '' && passwordRulesPass(newPassword) && confirmPassword === newPassword && !busy

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ready) return
    setBusy(true)
    setFailure('')
    try {
      await api('/account/password', 'PUT', { current_password: currentPassword, new_password: newPassword })
      onSuccess()
    } catch (caught) {
      // classroomClient 把失敗轉成 ApiError，錯誤碼（或 422 的欄位錯誤）在 detail
      const detail = caught instanceof ApiError ? caught.detail : undefined
      if (detail === 'CURRENT_PASSWORD_INVALID') setCurrentWrong(true)
      else if (caught instanceof ApiError && caught.status === 422 && rejectsNewPassword(detail)) setNewRejected(true)
      else if (detail === 'PASSWORD_CHANGE_RATE_LIMITED') setFailure('rateLimited')
      else if (detail === 'PASSWORD_CHANGE_UNAVAILABLE') setFailure('unavailable')
      else setFailure('failure')
    } finally {
      setBusy(false)
    }
  }

  const close = () => { if (!busy) onClose() }

  return <AccountFrame
    variant={variant}
    title={tr('title')}
    onClose={close}
    closeOnBackdrop={!busy}
    footer={<>
      <Button variant="outline" disabled={busy} onClick={close}>{tr('cancel')}</Button>
      <Button type="submit" form={FORM_ID} variant="primary" disabled={!ready}>{busy ? tr('saving') : tr('save')}</Button>
    </>}
  >
    <form id={FORM_ID} className={styles.form} onSubmit={event => void submit(event)} noValidate>
      <p className={styles.description}>{tr('description')}</p>

      <Field id="current-password" label={tr('current')} invalid={currentWrong}>
        <PasswordInput
          id="current-password"
          autoComplete="current-password"
          value={currentPassword}
          disabled={busy}
          data-autofocus
          aria-invalid={currentWrong || undefined}
          aria-describedby={describedBy(currentWrong && 'current-password-error')}
          onChange={event => { setCurrentPassword(event.target.value); setCurrentWrong(false); setFailure('') }}
        />
        {currentWrong && <FieldError id="current-password-error">{tr('incorrect')}</FieldError>}
      </Field>

      <Field id="new-password" label={tr('new')} invalid={newRejected}>
        <PasswordInput
          id="new-password"
          autoComplete="new-password"
          value={newPassword}
          disabled={busy}
          aria-invalid={newRejected || undefined}
          aria-describedby={describedBy(newRejected && 'new-password-error', 'new-password-rules')}
          onChange={event => { setNewPassword(event.target.value); setNewRejected(false); setFailure('') }}
        />
        {newRejected && <FieldError id="new-password-error">{tr('invalid')}</FieldError>}
        <PasswordRules id="new-password-rules" password={newPassword} />
      </Field>

      <Field id="confirm-password" label={tr('confirm')} invalid={mismatch}>
        <PasswordInput
          id="confirm-password"
          autoComplete="new-password"
          value={confirmPassword}
          disabled={busy}
          aria-invalid={mismatch || undefined}
          aria-describedby={describedBy(mismatch && 'confirm-password-error')}
          onChange={event => { setConfirmPassword(event.target.value); setFailure('') }}
        />
        {mismatch && <FieldError id="confirm-password-error">{tr('mismatch')}</FieldError>}
      </Field>

      {failure && <FormError role="alert">{tr(failure)}</FormError>}
    </form>
  </AccountFrame>
}
