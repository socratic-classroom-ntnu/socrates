
import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Dialog } from '../../components/Dialog'
import { api } from '../../contract/classroomClient'
import { useIsPhone } from '../../shared/useIsPhone'
import { Button, FieldError, FormError, RadioCards } from '../../ui'
import { useAuth } from '../auth/AuthContext'
import { accountName } from '../../shared/accountName'
import styles from './AccountSettingsPage.module.css'
import { avatarSrc } from '../../contract/accountClient'
import { AvatarEditor } from './AvatarEditor'
import { ChangePasswordDialog } from './ChangePasswordDialog'
import { useChangeLocale } from '../auth/useChangeLocale'
import { useT } from '../../i18n/useT'
import { LANGUAGE_NAMES, LOCALES } from '../../i18n/locale'
import { DeleteAccountDialog } from './DeleteAccountDialog'
import type { AccountNotice } from './AccountSubpage'

const MAX_NAME_LENGTH = 40

export function AccountSettingsPage() {
  const { account, replaceAccount } = useAuth()
  const { t, locale } = useT('shell')
  const { changeLocale, saving, failure } = useChangeLocale()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<'' | 'invalidLength' | 'failure'>('')
  const [success, setSuccess] = useState('')
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState('')

  const currentName = accountName(account)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [languageOpen, setLanguageOpen] = useState(false)
  const phone = useIsPhone()
  const navigate = useNavigate()
  const location = useLocation()
  const notice = (location.state as AccountNotice | null)?.notice

  useEffect(() => {
    if (!editing) setName(currentName)
  }, [currentName, editing])

  // 手機改完密碼從內頁回來（M10 → M00）：顯示一次成功提示，清掉 state，重新整理就不再出現
  useEffect(() => {
    if (notice !== 'passwordUpdated') return
    setPasswordSuccess('updated')
    navigate(location.pathname, { replace: true, state: null })
  }, [notice, navigate, location.pathname])

  if (!account) return null
  if (account.kind === 'guest' || account.kind === 'expired_guest') return <Navigate to="/" replace />

  async function pickLanguage(value: (typeof LOCALES)[number]) {
    if (await changeLocale(value)) setLanguageOpen(false)
  }

  function cancel() {
    setName(currentName)
    setEditing(false)
    setError('')
    setSuccess('')
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const trimmed = name.trim()
    const length = Array.from(trimmed).length

    if (!trimmed || length > MAX_NAME_LENGTH) {
      setError('invalidLength')
      return
    }

    setBusy(true)
    setError('')
    setSuccess('')

    try {
      const updated = await api('/account/profile', 'PATCH', {
        display_name: trimmed,
      })
      replaceAccount(updated)
      setEditing(false)
      setSuccess('updated')
    } catch {
      setError('failure')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className={styles.page}>
      <h1>{t('accountSettings.title')}</h1>

      <section className={styles.card} aria-labelledby="profile-title">
        <div className={styles.profileLayout}>
          <div className={styles.profileDetails}>
            <div className={styles.cardHeader}>
              <h2 id="profile-title">{t('accountSettings.profile.title')}</h2>
              {!editing && (
                <Button
                variant="quiet"
                className={styles.editButton}
                onClick={() => {
                    setEditing(true)
                    setError('')
                    setSuccess('')
                }}
                aria-label={t('accountSettings.profile.editLabel')}
                title={t('accountSettings.profile.editLabel')}
                >
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4L16.5 3.5z" />
                </svg>
                </Button>
              )}
            </div>

            <dl className={styles.infoList}>
              <div className={styles.infoRow}>
                <dt>{t('accountSettings.profile.account')}</dt>
                <dd>{account.username}</dd>
              </div>

              <div className={styles.infoRow}>
                <dt>{t('accountSettings.profile.displayName')}</dt>
                <dd>
                  {editing ? (
                    <form onSubmit={event => void save(event)}>
                      <div className={styles.nameEdit}>
                        <input
                            id="account-display-name"
                            className={styles.nameInput}
                            aria-label={t('accountSettings.profile.displayName')}
                            value={name}
                            maxLength={MAX_NAME_LENGTH}
                            disabled={busy}
                            onChange={event => {
                            setName(event.target.value)
                            setError('')
                            }}
                            aria-invalid={Boolean(error)}
                            aria-describedby={error ? 'account-name-error' : undefined}
                        />

                        {error && (
                            <FieldError id="account-name-error" role="alert">
                            {t(`accountSettings.profile.${error}`, { max: MAX_NAME_LENGTH })}
                            </FieldError>
                        )}
                        </div>

                      <div className={styles.actions}>
                        <Button variant="quiet" disabled={busy} onClick={cancel}>
                          {t('accountSettings.profile.cancel')}
                        </Button>
                        <Button type="submit" variant="primary" disabled={busy}>
                          {busy ? t('accountSettings.profile.saving') : t('accountSettings.profile.saveChanges')}
                        </Button>
                      </div>
                    </form>
                  ) : currentName}
                </dd>
              </div>

              <div className={styles.infoRow}>
                <dt>{t('accountSettings.profile.email')}</dt>
                <dd>{account.email || t('accountSettings.profile.notSet')}</dd>
              </div>
            </dl>

            {success && (
              <p className={styles.success} role="status">{t('accountSettings.profile.success')}</p>
            )}
          </div>

          <div className={styles.avatarArea}>
            <AvatarEditor
                name={currentName}
                avatarUrl={avatarSrc(account)}
                onUpdated={replaceAccount}
            />
            </div>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="password-title">
        <div className={styles.horizontalCard}>
          <div>
            <h2 id="password-title">{t('accountSettings.password.title')}</h2>
            <p className={styles.muted}>{t('accountSettings.password.description')}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setPasswordSuccess('')
              if (phone) navigate('/account/password')
              else setPasswordOpen(true)
            }}
          >
            {t('accountSettings.password.change')}
          </Button>
        </div>

        {passwordSuccess && (
          <p className={styles.success} role="status">
            {t('accountSettings.password.success')}
          </p>
        )}
      </section>

      {passwordOpen && (
        <ChangePasswordDialog
          onClose={() => setPasswordOpen(false)}
          onSuccess={() => {
            setPasswordOpen(false)
            setPasswordSuccess('updated')
          }}
        />
      )}

      <section className={styles.card} aria-labelledby="language-title">
        <h2 id="language-title">{t('accountSettings.language.title')}</h2>

        {phone ? (
          <button
            type="button"
            className={styles.row}
            aria-label={`${t('accountSettings.language.title')}：${LANGUAGE_NAMES[locale]}`}
            onClick={() => setLanguageOpen(true)}
          >
            <span>{LANGUAGE_NAMES[locale]}</span>
            <span className={styles.chevron} aria-hidden="true">›</span>
          </button>
        ) : (
          <div className={styles.languages}>
            <RadioCards
              legend={t('accountSettings.language.title')}
              name="account-language"
              options={LOCALES.map(value => ({
                value,
                label: LANGUAGE_NAMES[value],
              }))}
              value={locale}
              onChange={value => {
                void changeLocale(value)
              }}
              disabled={saving}
            />
          </div>
        )}

        {saving && !languageOpen && (
          <p className={styles.muted} role="status">
            {t('accountSettings.language.saving')}
          </p>
        )}

        {failure && !languageOpen && <FormError role="alert">{t('accountSettings.language.failure')}</FormError>}
      </section>

      {languageOpen && (
        <Dialog title={t('accountSettings.language.title')} placement="bottom" onClose={() => { if (!saving) setLanguageOpen(false) }}>
          <div className={styles.sheet}>
            <p className={styles.sheetTitle} aria-hidden="true">{t('accountSettings.language.title')}</p>
            {/* 一列一個按鈕：Tab 逐一走、Enter 選；目前的語言標 aria-current（Figma M09 的打勾） */}
            <ul className={styles.languageList} aria-label={t('accountSettings.language.title')}>
              {LOCALES.map(value => (
                <li key={value}>
                  <button
                    type="button"
                    aria-current={value === locale ? 'true' : undefined}
                    className={styles.languageOption}
                    disabled={saving}
                    onClick={() => void pickLanguage(value)}
                  >
                    {LANGUAGE_NAMES[value]}
                  </button>
                </li>
              ))}
            </ul>
            {failure && <FormError role="alert">{t('accountSettings.language.failure')}</FormError>}
            <Button variant="outline" disabled={saving} onClick={() => setLanguageOpen(false)}>
              {t('accountSettings.profile.cancel')}
            </Button>
          </div>
        </Dialog>
      )}

      <section className={styles.dangerSection} aria-labelledby="danger-title">
        <h2 id="danger-title">{t('accountSettings.deleteAccount.sectionTitle')}</h2>
        {phone ? (
          <button type="button" className={styles.dangerRow} onClick={() => navigate('/account/delete')}>
            <span className={styles.dangerText}>
              <span className={styles.dangerTitle}>{t('accountSettings.deleteAccount.title')}</span>
              <span className={styles.dangerHint}>{t('accountSettings.deleteAccount.irreversible')}</span>
            </span>
            <span className={styles.chevron} aria-hidden="true">›</span>
          </button>
        ) : (
          <div className={styles.dangerCard}>
            <div>
              <h3>{t('accountSettings.deleteAccount.title')}</h3>
              <p>{t('accountSettings.deleteAccount.description')}</p>
            </div>
            <Button
              variant="danger"
              onClick={() => setDeleteOpen(true)}
            >
              {t('accountSettings.deleteAccount.action')}
            </Button>
          </div>
        )}
      </section>
      {deleteOpen && (
        <DeleteAccountDialog
          username={account.username}
          onClose={() => setDeleteOpen(false)}
        />
      )}
    </main>
  )
}
