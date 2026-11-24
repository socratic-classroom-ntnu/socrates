import { useState } from 'react'
import { api } from '../../contract/classroomClient'
import { applyLocale } from '../../i18n'
import type { Locale } from '../../i18n/locale'
import { useT } from '../../i18n/useT'
import { useAuth } from './AuthContext'

/**
 * Switch the interface language. Signed in, the choice is also saved to the account and the
 * context is updated, so a later refresh does not put the old value back; if saving fails the
 * previous language comes back and `failure` explains why. Resolves to whether it was kept
 * (the phone language list closes only then).
 */
export function useChangeLocale() {
  const { locale } = useT('shell')
  const { account, replaceAccount } = useAuth()
  const [failure, setFailure] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)

  async function changeLocale(value: Locale): Promise<boolean> {
    const previousLocale = account?.locale ?? locale
    setFailure(null)
    await applyLocale(value)
    if (!account) return true
    setSaving(true)
    try {
      replaceAccount(await api('/account/locale', 'PUT', { locale: value }))
      return true
    } catch (error) {
      await applyLocale(previousLocale)
      setFailure(error ?? new Error('locale update failed'))
      return false
    } finally {
      setSaving(false)
    }
  }

  return { changeLocale, saving, failure }
}
