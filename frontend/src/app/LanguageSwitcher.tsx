import { useId, useState } from 'react'
import { api } from '../api/classroomClient'
import { applyLocale } from '../i18n'
import { errorMessage } from '../i18n/errors'
import { isLocale, LANGUAGE_NAMES, LOCALES } from '../i18n/locale'
import { useT } from '../i18n/useT'
import { useAuth } from './AuthContext'

// 語言名稱各用自己的語言寫，不翻譯。登入後同時寫回帳號，並更新 context，之後 refresh 不會被舊值蓋回去。
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { t, locale } = useT('shell')
  const { account, replaceAccount } = useAuth()
  const id = useId()
  const [failure, setFailure] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)

  async function choose(value: string) {
    if (!isLocale(value)) return
    const previousLocale = account?.locale ?? locale
    setFailure(null)
    await applyLocale(value)
    if (account) {
      setSaving(true)
      try {
        replaceAccount(await api('/account/locale', 'PUT', { locale: value }))
      } catch (error) {
        await applyLocale(previousLocale)
        setFailure(error ?? new Error('locale update failed'))
      } finally {
        setSaving(false)
      }
    }
  }

  // label 只放「語言」，不包住 select：否則選項文字會混進可及名稱
  return <div className={'language-switcher ' + className}>
    <label htmlFor={id} className="language-switcher__label">{t('language')}</label>
    <select id={id} value={locale} disabled={saving} onChange={event => void choose(event.target.value)}>
      {LOCALES.map(code => <option key={code} value={code} lang={code}>{LANGUAGE_NAMES[code]}</option>)}
    </select>
    {failure && <span role="alert" className="language-switcher__error">{errorMessage(t, failure)}</span>}
  </div>
}
