import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Dialog } from '../../components/Dialog'
import { createAnnouncement, deleteAnnouncement, listAnnouncements, type Announcement, type AnnouncementInput } from '../../contract/notificationClient'
import { errorCode } from '../../i18n/errors'
import { useT } from '../../i18n/useT'
import { Button, Field, FieldError, FieldHint, FormError, RadioCards, describedBy } from '../../ui'
import { adminTime } from './adminTime'
import styles from './Admin.module.css'

type OnError = (error: unknown) => void
const AUDIENCES = ['all', 'teacher', 'student'] as const satisfies readonly AnnouncementInput['audience'][]

export function AnnouncementsTab({ onError }: { onError: OnError }) {
  const { t, locale } = useT('admin')
  const [rows, setRows] = useState<Announcement[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Announcement | null>(null)

  useEffect(() => {
    let active = true
    void listAnnouncements().then(
      data => { if (active) setRows(data) },
      error => {
        if (!active) return
        setFailed(true)
        onError(error)
      },
    )
    return () => { active = false }
  }, [onError, loadAttempt])

  if (failed) return <div className={styles.announcementToolbar}>
    <FormError role="alert">{t('announcements.loadFailed')}</FormError>
    <Button variant="outline" onClick={() => {
      setFailed(false)
      setLoadAttempt(value => value + 1)
    }}>{t('announcements.retry')}</Button>
  </div>
  if (!rows) return <p role="status" className={styles.hint}>{t('announcements.loading')}</p>

  return <>
    <div className={styles.announcementToolbar}>
      <span className={styles.hint}>{t('announcements.count', { count: rows.length })}</span>
      <Button variant="primary" onClick={() => setCreating(true)}>{t('announcements.create')}</Button>
    </div>
    {rows.length > 0 ? <div className={`${styles.card} ${styles.announcementTableFrame}`}>
      <table className={styles.announcementTable}>
        <thead><tr>
          <th scope="col">{t('announcements.publishedAt')}</th>
          <th scope="col">{t('announcements.audience')}</th>
          <th scope="col">{t('announcements.title')}</th>
          <th scope="col">{t('announcements.publisher')}</th>
          <th scope="col"><span className="sr-only">{t('announcements.delete')}</span></th>
        </tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}>
          <td><time dateTime={new Date(row.published_at * 1000).toISOString()}>{adminTime(locale, row.published_at)}</time></td>
          <td>{t(`announcements.audiences.${row.audience}`)}</td>
          <td>{row.title}</td>
          <td>{row.published_by_username}</td>
          <td><Button variant="outline" className={styles.removeButton} onClick={() => setDeleting(row)}>
            {t('announcements.delete')}
          </Button></td>
        </tr>)}</tbody>
      </table>
    </div> : <div className={styles.announcementEmpty}>
      <span aria-hidden="true" />
      <strong>{t('announcements.empty')}</strong>
      <p>{t('announcements.emptyHint')}</p>
    </div>}
    {creating && <PublishAnnouncement
      onError={onError}
      onClose={() => setCreating(false)}
      onSave={saved => {
        setRows(current => current && [saved, ...current])
        setCreating(false)
      }}
    />}
    {deleting && <DeleteAnnouncement
      row={deleting}
      onError={onError}
      onClose={() => setDeleting(null)}
      onDelete={() => {
        setRows(current => current?.filter(row => row.id !== deleting.id) ?? null)
        setDeleting(null)
      }}
    />}
  </>
}

type Draft = Required<AnnouncementInput>
type Issue = Partial<Record<keyof Draft, string>>

const scheduleFields = ['maintenance_date', 'maintenance_start', 'maintenance_end'] as const
const emptyDraft: Draft = {
  audience: 'all', title: '', content: '', maintenance_date: '', maintenance_start: '', maintenance_end: '',
}
const clock = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/

function validate(draft: Draft): Issue {
  const issues: Issue = {}
  if (!draft.title.trim() || [...draft.title].length > 40) issues.title = 'invalidTitle'
  if (!draft.content.trim() || [...draft.content].length > 500) issues.content = 'invalidContent'
  const { maintenance_date: date, maintenance_start: start, maintenance_end: end } = draft
  if (date || start || end) {
    if (!(date && start && end)) {
      for (const field of scheduleFields) if (!draft[field]) issues[field] = 'incompleteWindow'
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) issues.maintenance_date = 'invalidDate'
      if (!clock.test(start)) issues.maintenance_start = 'invalidTime'
      if (!clock.test(end)) issues.maintenance_end = 'invalidTime'
      else if (end <= start) issues.maintenance_end = 'invalidWindow'
    }
  }
  return issues
}

function PublishAnnouncement({ onClose, onError, onSave }: {
  onClose(): void
  onError: OnError
  onSave(row: Announcement): void
}) {
  const { t } = useT('admin')
  const id = useId()
  const [draft, setDraft] = useState(emptyDraft)
  const [issues, setIssues] = useState<Issue>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const writing = useRef(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (writing.current) return
    const errors = validate(draft)
    setIssues(errors)
    setFailure(null)
    if (Object.keys(errors).length) return
    writing.current = true
    setBusy(true)
    try {
      onSave(await createAnnouncement({
        ...draft,
        maintenance_date: draft.maintenance_date || null,
        maintenance_start: draft.maintenance_start || null,
        maintenance_end: draft.maintenance_end || null,
      }))
    } catch (error) {
      setFailure(errorCode(error) === 'ANNOUNCEMENT_INVALID' ? 'invalid' : 'publishFailed')
      onError(error)
    } finally {
      writing.current = false
      setBusy(false)
    }
  }

  function update<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft(current => ({ ...current, [field]: value }))
    setIssues(current => ({ ...current, [field]: undefined }))
  }

  function field(name: Exclude<keyof Draft, 'audience'>, label: string, type = 'text') {
    const controlId = `${id}-${name}`
    const issue = issues[name]
    const hint = name === 'title' ? 'titleHint' : name === 'content' ? 'contentHint' : null
    const props = {
      id: controlId,
      value: draft[name] ?? '',
      disabled: busy,
      'aria-invalid': Boolean(issue),
      'aria-describedby': describedBy(hint && `${controlId}-hint`, issue && `${controlId}-error`),
      'aria-required': hint ? true : undefined,
    }
    return <Field key={name} id={controlId} label={t(`announcements.${label}`)} invalid={Boolean(issue)}>
      {name === 'content'
        ? <textarea {...props} rows={4} placeholder={t('announcements.contentPlaceholder')} onChange={event => update(name, event.target.value)} />
        : <input {...props} type={type} data-autofocus={name === 'title' ? '' : undefined}
          placeholder={name === 'title' ? t('announcements.titlePlaceholder') : undefined}
          onChange={event => update(name, event.target.value)} />}
      {hint && <FieldHint id={`${controlId}-hint`}>{t(`announcements.${hint}`)}</FieldHint>}
      {issue && <FieldError id={`${controlId}-error`}>{t(`announcements.${issue}`)}</FieldError>}
    </Field>
  }

  const close = () => { if (!writing.current) onClose() }
  return <Dialog title={t('announcements.create')} onClose={close} size="medium" footer={<>
    <Button variant="outline" disabled={busy} onClick={close}>{t('announcements.cancel')}</Button>
    <Button variant="primary" form={id} type="submit" disabled={busy} aria-busy={busy}>
      {t(busy ? 'announcements.publishing' : 'announcements.publish')}
    </Button>
  </>}>
    <form className={styles.announcementForm} id={id} onSubmit={event => { void submit(event) }} aria-busy={busy} noValidate>
      <RadioCards
        legend={t('announcements.audience')}
        name="audience"
        options={AUDIENCES.map(value => ({ value, label: t(`announcements.audiences.${value}`) }))}
        value={draft.audience}
        onChange={value => update('audience', value)}
        disabled={busy}
      />
      {field('title', 'title')}
      {field('content', 'content')}
      <div className={styles.announcementSchedule}>
        {field('maintenance_date', 'date', 'date')}
        {field('maintenance_start', 'start', 'time')}
        {field('maintenance_end', 'end', 'time')}
      </div>
      {failure && <FormError role="alert">{t(`announcements.${failure}`)}</FormError>}
    </form>
  </Dialog>
}

function DeleteAnnouncement({ row, onClose, onDelete, onError }: {
  row: Announcement
  onClose(): void
  onDelete(): void
  onError: OnError
}) {
  const { t } = useT('admin')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const writing = useRef(false)

  async function remove() {
    if (writing.current) return
    writing.current = true
    setBusy(true)
    setFailed(false)
    try {
      await deleteAnnouncement(row.id)
      onDelete()
    } catch (error) {
      setFailed(true)
      onError(error)
    } finally {
      writing.current = false
      setBusy(false)
    }
  }
  const close = () => { if (!writing.current) onClose() }
  return <Dialog title={t('announcements.deleteTitle')} tone="danger" onClose={close} footer={<>
    <Button variant="outline" disabled={busy} onClick={close}>{t('announcements.cancel')}</Button>
    <Button variant="danger" disabled={busy} onClick={() => { void remove() }}>{t('announcements.delete')}</Button>
  </>}>
    <p className={styles.announcementDeleteQuestion}>{t('announcements.deleteQuestion', { title: row.title })}</p>
    <p className={styles.hint}>{t('announcements.deleteHint')}</p>
    {failed && <FormError role="alert">{t('announcements.deleteFailed')}</FormError>}
  </Dialog>
}
