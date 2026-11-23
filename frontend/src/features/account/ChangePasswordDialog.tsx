
import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, api } from '../../contract/classroomClient'
import { useT } from '../../i18n/useT'
import { Button } from '../../ui'
import styles from './ChangePasswordDialog.module.css'

type Props = {
  onClose: () => void
  onSuccess: () => void
}

const PASSWORD_RULE =
  /^(?=.{8,32}$)(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[!@#$%^&*_\-+=.?~])[A-Za-z0-9!@#$%^&*_\-+=.?~]+$/

const PASSWORD_CHECKS = [
  {
    label: 'length',
    test: (value: string) => value.length >= 8 && value.length <= 32,
  },
  {
    label: 'uppercase',
    test: (value: string) => /[A-Z]/.test(value),
  },
  {
    label: 'lowercase',
    test: (value: string) => /[a-z]/.test(value),
  },
  {
    label: 'number',
    test: (value: string) => /[0-9]/.test(value),
  },
  {
    label: 'special',
    test: (value: string) => /[!@#$%^&*_\-+=.?~]/.test(value),
  },
]

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {hidden && <path d="M3 3 21 21" />}
    </svg>
  )
}

export function ChangePasswordDialog({ onClose, onSuccess }: Props) {
  const { t } = useT('shell')
  const { t: commonT } = useT('common')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<'' | 'required' | 'invalid' | 'mismatch' | 'incorrect' | 'rateLimited' | 'unavailable' | 'failure'>('')

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose()
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [busy, onClose])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    setError('')

    if (!currentPassword) {
      setError('required')
      return
    }

    if (!PASSWORD_RULE.test(newPassword)) {
      setError('invalid')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('mismatch')
      return
    }

    setBusy(true)

    try {
      await api('/account/password', 'PUT', {
        current_password: currentPassword,
        new_password: newPassword,
      })

      onSuccess()
    } catch (caught) {
      // classroomClient 把失敗轉成 ApiError，錯誤碼在 detail
      const detail = caught instanceof ApiError ? caught.detail : undefined

      if (detail === 'CURRENT_PASSWORD_INVALID') {
        setError('incorrect')
      } else if (detail === 'PASSWORD_CHANGE_RATE_LIMITED') {
        setError('rateLimited')
      } else if (detail === 'PASSWORD_CHANGE_UNAVAILABLE') {
        setError('unavailable')
      } else {
        setError('failure')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={styles.overlay}
      onMouseDown={event => {
        if (event.target === event.currentTarget && !busy) {
          onClose()
        }
      }}
    >
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
      >
        <div className={styles.header}>
          <div>
            <h2 id="change-password-title">{t('accountSettings.password.change')}</h2>
            <p>{t('accountSettings.passwordDialog.description')}</p>
          </div>
          <button
            type="button"
            className={styles.close}
            aria-label={commonT('close')}
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <form onSubmit={event => void submit(event)}>
          <div className={styles.field}>
            <label htmlFor="current-password">{t('accountSettings.passwordDialog.current')}</label>
            <div className={styles.passwordInput}>
              <input
                id="current-password"
                type={showCurrentPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={currentPassword}
                disabled={busy}
                onChange={event => {
                  setCurrentPassword(event.target.value)
                  setError('')
                }}
                required
                autoFocus
              />
              <button
                type="button"
                className={styles.eyeButton}
                onClick={() => setShowCurrentPassword(value => !value)}
                aria-label={t(`accountSettings.passwordDialog.${showCurrentPassword ? 'hide' : 'show'}`, {
                  field: t('accountSettings.passwordDialog.current'),
                })}
                aria-pressed={showCurrentPassword}
                disabled={busy}
              >
                <EyeIcon hidden={showCurrentPassword} />
              </button>
            </div>
          </div>


          <div className={styles.field}>
            <label htmlFor="new-password">{t('accountSettings.passwordDialog.new')}</label>
            <div className={styles.passwordInput}>
              <input
                id="new-password"
                type={showNewPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={newPassword}
                disabled={busy}
                onChange={event => {
                  setNewPassword(event.target.value)
                  setError('')
                }}
                required
              />
              <button
                type="button"
                className={styles.eyeButton}
                onClick={() => setShowNewPassword(value => !value)}
                aria-label={t(`accountSettings.passwordDialog.${showNewPassword ? 'hide' : 'show'}`, {
                  field: t('accountSettings.passwordDialog.new'),
                })}
                aria-pressed={showNewPassword}
                disabled={busy}
              >
                <EyeIcon hidden={showNewPassword} />
              </button>
            </div>
            {newPassword && PASSWORD_RULE.test(newPassword) ? (
              <p className={styles.validPassword} role="status">
                <span aria-hidden="true">✓</span>
                {t('accountSettings.passwordDialog.valid')}
              </p>
            ) : (
              <div
                className={styles.passwordRules}
                aria-label={t('accountSettings.passwordDialog.rulesLabel')}
              >
                {PASSWORD_CHECKS.map(rule => {
                  const passed = rule.test(newPassword)

                  return (
                    <div
                      key={rule.label}
                      className={`${styles.passwordRule} ${
                        passed ? styles.rulePassed : styles.rulePending
                      }`}
                    >
                      <span aria-hidden="true">
                        {passed ? '✓' : '○'}
                      </span>
                      <span>{t(`accountSettings.passwordDialog.${rule.label}`)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div className={styles.field}>
            <label htmlFor="confirm-password">{t('accountSettings.passwordDialog.confirm')}</label>
            <div className={styles.passwordInput}>
              <input
                id="confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                disabled={busy}
                onChange={event => {
                  setConfirmPassword(event.target.value)
                  setError('')
                }}
                required
              />
              <button
                type="button"
                className={styles.eyeButton}
                onClick={() => setShowConfirmPassword(value => !value)}
                aria-label={t(`accountSettings.passwordDialog.${showConfirmPassword ? 'hide' : 'show'}`, {
                  field: t('accountSettings.passwordDialog.confirm'),
                })}
                aria-pressed={showConfirmPassword}
                disabled={busy}
              >
                <EyeIcon hidden={showConfirmPassword} />
              </button>
            </div>
            {confirmPassword.length > 0 && (
            <p
                className={
                newPassword === confirmPassword
                    ? styles.validPassword
                    : styles.invalidPassword
                }
                role="status"
            >
                {newPassword === confirmPassword
                ? t('accountSettings.passwordDialog.match')
                : t('accountSettings.passwordDialog.mismatch')}
            </p>
            )}
          </div>

          {error && (
            <p className={styles.error} role="alert">
              {t(`accountSettings.passwordDialog.${error}`)}
            </p>
          )}

          <div className={styles.actions}>
            <Button
              type="button"
              variant="quiet"
              disabled={busy}
              onClick={onClose}
            >
              {t('accountSettings.passwordDialog.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={busy}
            >
              {busy ? t('accountSettings.passwordDialog.saving') : t('accountSettings.passwordDialog.save')}
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}
