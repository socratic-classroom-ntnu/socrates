import { type FormEvent, useId, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api/classroomClient'
import type { components } from '../../api/classroomTypes'
import { errorCode, errorMessage } from '../../i18n/errors'
import { useT } from '../../i18n/useT'

type Preview = components['schemas']['JoinPreview']

/** 「掃描／代碼／加入」：查得到就去 J1（已加入的直接進課程頁），查不到就在表單下方說明（X3m）。 */
export function JoinCodeForm({ variant }: { variant: 'inline' | 'phone' }) {
  const { t } = useT('home')
  const navigate = useNavigate()
  const id = useId()
  const [value, setValue] = useState('')
  const [failure, setFailure] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const notFound = errorCode(failure) === 'ENROLL_CODE_NOT_FOUND'

  async function submit(event: FormEvent) {
    event.preventDefault()
    const code = value.replace(/\s+/g, '').toUpperCase()
    if (!code || busy) return
    setBusy(true)
    setFailure(null)
    try {
      const preview: Preview = await api('/course-join/preview?code=' + encodeURIComponent(code))
      if (preview.already_enrolled) navigate(`/learn/courses/${preview.course_id}`)
      else navigate('/join?code=' + encodeURIComponent(code), { state: { preview: { ...preview, code } } })
    } catch (error) {
      setFailure(error)
    } finally {
      setBusy(false)
    }
  }

  return <form className={`join-code join-code--${variant}`} onSubmit={event => void submit(event)} noValidate>
    <div className="join-code__row">
      {variant === 'phone' && <Link className="button button--dark join-code__scan" to="/scan">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><circle cx="12" cy="12" r="3" /></svg>
        {t('join.scan')}
      </Link>}
      <label htmlFor={id} className="sr-only">{t('join.label')}</label>
      <input
        id={id}
        className="join-code__input"
        value={value}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={32}
        placeholder={variant === 'phone' ? t('join.phonePlaceholder') : t('join.placeholder')}
        aria-invalid={notFound ? true : undefined}
        aria-describedby={failure ? id + '-error' : undefined}
        onChange={event => { setValue(event.target.value); setFailure(null) }}
      />
      <button type="submit" className="button button--outline" disabled={busy}>{variant === 'phone' ? t('join.phoneSubmit') : t('join.submit')}</button>
    </div>
    {failure && <div id={id + '-error'} role="alert" className="join-code__error">
      {notFound
        ? <><strong>{t('join.notFoundTitle')}</strong><span>{t('join.notFoundBody')}</span></>
        : <span>{errorMessage(t, failure)}</span>}
    </div>}
  </form>
}
