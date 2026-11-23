
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog } from '../../components/Dialog'
import { Button } from '../../ui'
import { checkAccountDeletion, deleteAccount, ApiError } from '../../contract/classroomClient'
import { useAuth } from '../auth/AuthContext'
import { useT } from '../../i18n/useT'
import styles from './DeleteAccountDialog.module.css'

type Props = {
  username: string
  onClose: () => void
}

type Step = 'checking' | 'blocked' | 'warning' | 'confirm'
type ErrorKey = '' | 'checkFailed' | 'usernameMismatch' | 'unavailable' | 'failed'

export function DeleteAccountDialog({ username, onClose }: Props) {
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

  return (
    <Dialog
      title={tr('title')}
      tone="danger"
      onClose={close}
      closeOnBackdrop={!busy}
      footer={
        step === 'warning' ? (
          <>
            <Button variant="quiet" onClick={close}>
              {tr('cancel')}
            </Button>
            <Button variant="danger" onClick={() => setStep('confirm')}>
              {tr('continue')}
            </Button>
          </>
        ) : step === 'blocked' ? (
          <Button variant="quiet" onClick={close}>
            {tr('close')}
          </Button>
        ) : undefined
      }
    >
      {step === 'checking' && (
        <div className={styles.content}>
          <p role="status">{tr('checking')}</p>
          {error && <p role="alert" className={styles.error}>{tr(error)}</p>}
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
          {error && <p role="alert" className={styles.error}>{tr(error)}</p>}
        </div>
      )}

      {step === 'warning' && (
        <div className={styles.content}>
          <p>{tr('warning')}</p>
          <p>{tr('preservedData')}</p>
          <p className={styles.warning}>{tr('irreversible')}</p>
        </div>
      )}

      {step === 'confirm' && (
        <form onSubmit={event => void submit(event)} className={styles.content}>
          <p>{tr('confirmDescription')}</p>
          <label htmlFor="delete-account-username">
            {tr('usernameLabel')}
          </label>
          <strong className={styles.username}>{username}</strong>
          <input
            ref={usernameInput}
            id="delete-account-username"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={enteredUsername}
            disabled={busy}
            onChange={event => {
              setEnteredUsername(event.target.value)
              setError('')
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'delete-account-error' : undefined}
            className={styles.input}
            data-autofocus
          />

          {error && <p id="delete-account-error" role="alert" className={styles.error}>{tr(error)}</p>}

          <div className={styles.actions}>
            <Button
              type="button"
              variant="quiet"
              disabled={busy}
              onClick={() => setStep('warning')}
            >
              {tr('back')}
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={busy || !matches}
            >
              {busy ? tr('deleting') : tr('confirmDelete')}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
