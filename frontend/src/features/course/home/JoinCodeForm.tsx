import { type FormEvent, useId, useState } from 'react'
import { useT } from '../../../i18n/useT'
import { Button } from '../../../ui'
import { ScanButton } from '../scan/ScanButton'
import { JoinCodeErrorText, useJoinCode } from './useJoinCode'

/** 「掃描／代碼／加入」：查得到就去 J1（已加入的直接進課程頁），查不到就在表單下方說明（X3m）。 */
export function JoinCodeForm({ variant }: { variant: 'inline' | 'phone' }) {
  const { t } = useT('home')
  const id = useId()
  const [value, setValue] = useState('')
  const { lookUp, busy, failure, notFound, clearFailure } = useJoinCode()

  function submit(event: FormEvent) {
    event.preventDefault()
    void lookUp(value)
  }

  return <form className={`join-code join-code--${variant}`} onSubmit={submit} noValidate>
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
        onChange={event => { setValue(event.target.value); clearFailure() }}
      />
      <Button type="submit" variant="outline" className="join-code__button" disabled={busy}>{variant === 'phone' ? t('join.phoneSubmit') : t('join.submit')}</Button>
    </div>
    {failure && <div id={id + '-error'} role="alert" className="join-code__error">
      <JoinCodeErrorText failure={failure} />
    </div>}
  </form>
}
