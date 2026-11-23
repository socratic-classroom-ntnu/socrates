
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, FieldError, FieldHint, FormError, describedBy } from '../../ui'
import { AccountFrame, type FrameVariant } from './AccountFrame'
import { checkAccountDeletion, deleteAccount, ApiError } from '../../contract/classroomClient'
import { useAuth } from '../auth/AuthContext'
import { useT } from '../../i18n/useT'
import styles from './DeleteAccountDialog.module.css'

type Props = {
  /** 電腦版是對話框，手機是 /account/delete 內頁（Figma M13–M16） */
  variant?: FrameVariant
  username: string
  onClose: () => void
}

type Step = 'checking' | 'blocked' | 'warning' | 'confirm'
type ErrorKey = '' | 'checkFailed' | 'usernameMismatch' | 'unavailable' | 'failed'

export function DeleteAccountDialog({ variant = 'dialog', username, onClose }: Props) {
  const { t } = useT('shell')
  const { clearSession } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('checking')
  const [enteredUsername, setEnteredUsername] = useState('')
  const [courses, setCourses] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ErrorKey>('')
  const [checkAttempt, setCheckAttempt] = useState(0)
  const submitting = useRef(false)
  const usernameInput = useRef<HTMLInputElement>(null)

  const tr = (key: string) => t(`accountSettings.deleteAccount.${key}`)
  const matches =
    enteredUsername.trim().toLowerCase() === username.toLowerCase()
  // 打了字但跟帳號不一樣就提示（Figma M16）；後端也比對，回 ACCOUNT_USERNAME_MISMATCH 時顯示同一句
  const typedMismatch = enteredUsername.trim() !== '' && !matches

  useEffect(() => {
    const controller = new AbortController()
    setError('')
    async function checkEligibility() {
      try {
        const result = await checkAccountDeletion(controller.signal)
        if (controller.signal.aborted) return
        setCourses(result.courses)
        setStep(result.can_delete ? 'warning' : 'blocked')
      } catch {
        if (!controller.signal.aborted) setError('checkFailed')
      }
    }
    void checkEligibility()
    return () => controller.abort()
  }, [checkAttempt])

  useEffect(() => {
    if (step === 'confirm') usernameInput.current?.focus()
  }, [step])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current || step !== 'confirm' || !matches) return

    submitting.current = true
    setBusy(true)
    setError('')

    try {
      const result = await deleteAccount(enteredUsername.trim())

      if (result?.status !== 'ACCOUNT_DELETED') {
        throw new Error('Unexpected deletion response')
      }

      clearSession()
      navigate('/login', { replace: true })
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.detail === 'ACCOUNT_HAS_COURSES') {
          setError('')
          setStep('blocked')
          // Refresh the course list, which may have changed
          // since the initial eligibility check.
          try {
            const result = await checkAccountDeletion()
            setCourses(result.courses)
          } catch {
            setError('checkFailed')
          }
        } else if (caught.detail === 'ACCOUNT_USERNAME_MISMATCH') {
          setError('usernameMismatch')
        } else if (caught.status === 401 || caught.status === 403) {
          setError('unavailable')
        } else {
          setError('failed')
        }
      } else {
        setError('failed')
      }
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  const close = () => {
    if (!submitting.current) onClose()
  }

  const mismatchShown = typedMismatch || error === 'usernameMismatch'
  const formError = error && error !== 'usernameMismatch' ? error : ''
  const FORM_ID = 'delete-account-form'

  return (
    <AccountFrame
      variant={variant}
      title={tr('title')}
      tone="danger"
      onClose={close}
      closeOnBackdrop={!busy}
      steps={step === 'warning' || step === 'confirm'
        ? <p className={styles.step}>{tr(step === 'warning' ? 'step1' : 'step2')}</p>
        : undefined}
      footer={
        step === 'warning' ? (
          <>
            <Button variant="outline" onClick={close}>{tr('keep')}</Button>
            <Button variant="danger" onClick={() => setStep('confirm')}>{tr('continue')}</Button>
          </>
        ) : step === 'blocked' ? (
          <Button variant="primary" onClick={close}>{tr('understood')}</Button>
        ) : step === 'confirm' ? (
          <>
            <Button variant="outline" disabled={busy} onClick={close}>{tr('cancel')}</Button>
            <Button type="submit" form={FORM_ID} variant="danger" disabled={busy || !matches}>
              {busy ? tr('deleting') : tr('confirmDelete')}
            </Button>
          </>
        ) : undefined
      }
    >
      {step === 'checking' && (
        <div className={styles.content}>
          <p role="status">{tr('checking')}</p>
          {error && <FormError role="alert">{tr(error)}</FormError>}
          {error && (
            <Button
              variant="outline"
              onClick={() => {
                setError('')
                setCheckAttempt(value => value + 1)
              }}
            >
              {tr('retry')}
            </Button>
          )}
        </div>
      )}

      {step === 'blocked' && (
        <div className={styles.content}>
          <p>{tr(courses.length > 0 ? 'blocked' : 'unavailable')}</p>
          {courses.length > 0 && (
            <ul className={styles.courseList}>
              {courses.map((course, index) => (
                <li key={`${course}-${index}`}>{course}</li>
              ))}
            </ul>
          )}
          {error && <FormError role="alert">{tr(error)}</FormError>}
        </div>
      )}

      {step === 'warning' && (
        <div className={styles.content}>
          <h2 className={styles.question}>{tr('question')}</h2>
          <p>{tr('warning')}</p>
          <div className={styles.impact}>
            <p className={styles.impactTitle}>{tr('irreversible')}</p>
            <ul>
              <li>{tr('impactData')}</li>
              <li>{tr('impactRestore')}</li>
            </ul>
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <form id={FORM_ID} onSubmit={event => void submit(event)} className={styles.content} noValidate>
          <h2 className={styles.question}>{tr('confirmTitle')}</h2>
          <p>{tr('confirmDescription')}</p>
          <p className={styles.username}>{username}</p>
          <label htmlFor="delete-account-username" className={styles.label}>
            {tr('usernameLabel')}
          </label>
          <input
            ref={usernameInput}
            id="delete-account-username"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t('accountSettings.deleteAccount.placeholder', { username })}
            value={enteredUsername}
            disabled={busy}
            onChange={event => {
              setEnteredUsername(event.target.value)
              setError('')
            }}
            aria-invalid={mismatchShown || undefined}
            aria-describedby={describedBy(mismatchShown ? 'delete-account-error' : 'delete-account-hint')}
            className={styles.input}
            data-autofocus
          />
          {mismatchShown
            ? <FieldError id="delete-account-error" role="alert">{tr('usernameMismatch')}</FieldError>
            : <FieldHint id="delete-account-hint">{tr('confirmHint')}</FieldHint>}
          {formError && <FormError role="alert">{tr(formError)}</FormError>}
        </form>
      )}
    </AccountFrame>
  )
}
