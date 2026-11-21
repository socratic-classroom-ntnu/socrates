import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ComingSoonPage } from '../../components/ComingSoonPage'
import { Dialog } from '../../components/Dialog'
import { addAdmin, ApiError, listAdmins, listToggles, removeAdmin, updateToggle, type AdminView, type ToggleView } from '../../contract/classroomClient'
import { useT } from '../../i18n/useT'
import { useIsPhone } from '../../shared/useIsPhone'
import { Button, FormError } from '../../ui'
import { useAuth } from '../auth/AuthContext'
import { FeedbackTable } from '../feedback/FeedbackTable'
import styles from './Admin.module.css'
import { adminTime } from './adminTime'
import { SystemAITab } from './SystemAITab'

type Tab = 'toggles' | 'systemAI' | 'feedback' | 'admins'
type OnError = (failure: unknown) => void

const LOST_ACCESS = new Set(['ADMIN_NOT_FOUND', 'FEEDBACK_NOT_FOUND'])

/** 開著後台時被別人移除管理員：API 回 404 就重讀帳號狀態，AdminGate 會換成「找不到這個頁面」。 */
function useLostAccess(): OnError {
  const { refresh } = useAuth()
  return useCallback((failure: unknown) => {
    if (failure instanceof ApiError && failure.status === 404 && LOST_ACCESS.has(String(failure.detail))) void refresh()
  }, [refresh])
}
const TABS: { key: Tab; to: string }[] = [
  { key: 'toggles', to: '/admin' },
  { key: 'systemAI', to: '/admin/system-ai' },
  { key: 'feedback', to: '/admin/feedback' },
  { key: 'admins', to: '/admin/admins' },
]

/** 後台（Figma AD3–AD9、後台 spec P11–P15、P31）：四個分頁對應四個網址；只做電腦版。 */
export function AdminPage({ tab }: { tab: Tab }) {
  const { t } = useT('admin')
  const phone = useIsPhone()
  const onError = useLostAccess()
  if (phone) return <ComingSoonPage illustration="desktopOnly" title={t('desktopOnly.title')} body={t('desktopOnly.body')} />
  return <main className={styles.page}>
    <h1>{t('title')}</h1>
    <nav role="tablist" aria-label={t('tabsLabel')} className={styles.tabs}>
      {TABS.map(item => <Link key={item.key} role="tab" aria-selected={tab === item.key} className={styles.tab} to={item.to}>{t(`tabs.${item.key}`)}</Link>)}
    </nav>
    {tab === 'toggles' && <TogglesTab onError={onError} />}
    {tab === 'systemAI' && <SystemAITab onError={onError} />}
    {tab === 'feedback' && <FeedbackTable onError={onError} />}
    {tab === 'admins' && <AdminsTab onError={onError} />}
  </main>
}

function TogglesTab({ onError }: { onError: OnError }) {
  const { t, locale } = useT('admin')
  const [rows, setRows] = useState<ToggleView[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [confirm, setConfirm] = useState<ToggleView | null>(null)
  useEffect(() => {
    void listToggles().then(setRows).catch((failure: unknown) => { setLoadFailed(true); onError(failure) })
  }, [onError])

  async function change(row: ToggleView, enabled: boolean) {
    setConfirm(null)
    setBusy(row.key)
    setFailed(false)
    try {
      const saved = await updateToggle(row.key, enabled)
      setRows(current => current?.map(item => (item.key === saved.key ? saved : item)) ?? current)
    } catch (failure) {
      setFailed(true)
      onError(failure)
    } finally {
      setBusy(null)
    }
  }

  return <>
    {loadFailed && <FormError role="alert">{t('toggles.loadFailed')}</FormError>}
    {failed && <FormError role="alert">{t('toggles.failed')}</FormError>}
    {rows && <section className={`${styles.card} ${styles.toggleCard}`} aria-label={t('tabs.toggles')}>
      {rows.map(row => <div key={row.key} className={styles.toggleRow}>
        <div className={styles.toggleText}>
          <span className={styles.toggleName}>
            {row.name}
            <span className={styles.state} data-on={row.enabled}>{t(row.enabled ? 'toggles.on' : 'toggles.off')}</span>
            {row.updated_at !== null && <LastChange text={t('toggles.changed', {
              name: row.updated_by_name ?? '—',
              time: adminTime(locale, row.updated_at),
              action: t(row.enabled ? 'toggles.actionOn' : 'toggles.actionOff'),
            })} />}
          </span>
          <span className={styles.description}>{row.description}</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={row.enabled}
          aria-label={row.name}
          className={styles.switch}
          disabled={busy === row.key}
          onClick={() => {
            if (!row.enabled) void change(row, true)
            else if (row.disable_warning) setConfirm(row)
            else void change(row, false)
          }}
        />
      </div>)}
    </section>}
    <p className={styles.hint}>{t('toggles.hint')}</p>
    {confirm && <Dialog
      title={t('toggles.confirmTitle', { name: confirm.name })}
      tone="danger"
      onClose={() => setConfirm(null)}
      footer={<>
        <Button variant="outline" onClick={() => setConfirm(null)}>{t('toggles.cancel')}</Button>
        <Button variant="danger" onClick={() => { void change(confirm, false) }}>{t('toggles.confirm', { name: confirm.name })}</Button>
      </>}
    >
      <p>{confirm.disable_warning}</p>
    </Dialog>}
  </>
}

/** 改過的開關旁的 ⓘ：滑鼠移上或鍵盤 focus 時在上方顯示最後一次改動（後台 spec P38）。 */
function LastChange({ text }: { text: string }) {
  const { t } = useT('admin')
  const id = useId()
  const [shown, setShown] = useState(false)
  return <span className={styles.info}>
    <button
      type="button"
      className={styles.infoButton}
      aria-label={t('toggles.lastChange')}
      aria-describedby={id}
      onMouseEnter={() => setShown(true)}
      onMouseLeave={() => setShown(false)}
      onFocus={() => setShown(true)}
      onBlur={() => setShown(false)}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></svg>
    </button>
    <span role={shown ? 'tooltip' : undefined} id={id} className={styles.tooltip} hidden={!shown}>{text}</span>
  </span>
}

const ADD_ERRORS = new Set(['ADMIN_ACCOUNT_NOT_FOUND', 'ADMIN_GUEST_NOT_ALLOWED', 'ADMIN_UNVERIFIED', 'ADMIN_ALREADY'])

function AdminsTab({ onError }: { onError: OnError }) {
  const { t } = useT('admin')
  const [people, setPeople] = useState<AdminView[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<AdminView | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    try {
      setPeople(await listAdmins())
      setLoadFailed(false)
    } catch (failure) {
      setPeople(null)
      setLoadFailed(true)
      onError(failure)
    }
  }, [onError])
  useEffect(() => { void refresh() }, [refresh])

  function reason(failure: unknown): string {
    const code = failure instanceof ApiError && typeof failure.detail === 'string' ? failure.detail : ''
    return ADD_ERRORS.has(code) || code === 'ADMIN_CANNOT_REMOVE_SELF' ? t(`admins.errors.${code}`) : t('admins.errors.generic')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await addAdmin(name.trim())
      setName('')
      await refresh()
    } catch (failure) {
      setError(reason(failure))
      onError(failure)
    } finally {
      setBusy(false)
    }
  }

  async function confirmRemove(person: AdminView) {
    setRemoveError(null)
    try {
      await removeAdmin(person.account_id)
      setRemoving(null)
      await refresh()
    } catch (failure) {
      setRemoveError(reason(failure))
      onError(failure)
    }
  }

  return <>
    <form className={`${styles.card} ${styles.form}`} onSubmit={event => { void submit(event) }}>
      <label htmlFor="admin-username">{t('admins.addLabel')}</label>
      <div className={styles.formRow}>
        <input id="admin-username" className={styles.input} value={name} placeholder={t('admins.placeholder')} aria-invalid={error ? true : undefined} aria-describedby={error ? 'admin-username-error' : undefined} onChange={event => setName(event.target.value)} />
        <Button type="submit" variant="primary" disabled={busy || !name.trim()}>{t('admins.add')}</Button>
      </div>
      {error && <p id="admin-username-error" role="alert" className={styles.fieldError}>{error}</p>}
      <span className={styles.hint}>{t('admins.hint')}</span>
    </form>
    {loadFailed && <FormError role="alert">{t('admins.loadFailed')}</FormError>}
    {people && <section className={styles.card} aria-label={t('admins.listLabel')}>
      <h2 className={styles.listTitle}>{t('admins.listTitle', { count: people.length })}</h2>
      <ul className={styles.list}>
        {people.map(person => <li key={person.account_id} className={styles.person}>
          <span className={styles.avatar} aria-hidden="true">{(person.display_name || person.username).slice(0, 1)}</span>
          <span className={styles.personText}><b>{person.display_name || person.username}</b><span className={styles.personMeta}>{person.username} · {t(`admins.role.${person.account_role === 'teacher' ? 'teacher' : 'student'}`)}</span></span>
          {person.is_you
            ? <span className={styles.you}>{t('admins.you')}</span>
            : <Button variant="outline" className={styles.removeButton} onClick={() => { setRemoveError(null); setRemoving(person) }}>{t('admins.remove')}</Button>}
        </li>)}
      </ul>
    </section>}
    {removing && <Dialog
      title={t('admins.removeTitle', { name: removing.username })}
      tone="danger"
      onClose={() => setRemoving(null)}
      footer={<>
        <Button variant="outline" onClick={() => setRemoving(null)}>{t('admins.cancel')}</Button>
        <Button variant="danger" onClick={() => { void confirmRemove(removing) }}>{t('admins.remove')}</Button>
      </>}
    >
      <p>{t('admins.removeBody', { name: removing.username })}</p>
      {removeError && <FormError role="alert">{removeError}</FormError>}
    </Dialog>}
  </>
}
