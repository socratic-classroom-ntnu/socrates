import { useId } from 'react'
import { errorMessage } from '../i18n/errors'
import { isLocale, LANGUAGE_NAMES, LOCALES } from '../i18n/locale'
import { useT } from '../i18n/useT'
import { useChangeLocale } from './useChangeLocale'

// 登入、驗證頁用的語言下拉。語言名稱各用自己的語言寫，不翻譯。
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { t, locale } = useT('shell')
  const { changeLocale, saving, failure } = useChangeLocale()
  const id = useId()

  // label 只放「語言」，不包住 select：否則選項文字會混進可及名稱
  return <div className={'language-switcher ' + className}>
    <label htmlFor={id} className="language-switcher__label">{t('language')}</label>
    <select id={id} value={locale} disabled={saving} onChange={event => { if (isLocale(event.target.value)) void changeLocale(event.target.value) }}>
      {LOCALES.map(code => <option key={code} value={code} lang={code}>{LANGUAGE_NAMES[code]}</option>)}
    </select>
    {failure && <span role="alert" className="language-switcher__error">{errorMessage(t, failure)}</span>}
  </div>
}
