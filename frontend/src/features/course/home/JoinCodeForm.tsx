import { type FormEvent, useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../../contract/classroomClient'
import type { components } from '../../../contract/classroomTypes'
import { errorCode, errorMessage } from '../../../i18n/errors'
import { useT } from '../../../i18n/useT'
import { Button } from '../../../ui'
import { ScanButton } from '../scan/ScanButton'

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
      {variant === 'phone' && <ScanButton className="join-code__button join-code__scan" />}
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
      <Button type="submit" variant="outline" className="join-code__button" disabled={busy}>{variant === 'phone' ? t('join.phoneSubmit') : t('join.submit')}</Button>
    </div>
    {failure && <div id={id + '-error'} role="alert" className="join-code__error">
      {notFound
        ? <><strong>{t('join.notFoundTitle')}</strong><span>{t('join.notFoundBody')}</span></>
        : <span>{errorMessage(t, failure)}</span>}
    </div>}
  </form>
}
