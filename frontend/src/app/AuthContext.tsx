import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, setCSRF } from '../api/classroomClient'
import type { components } from '../api/classroomTypes'
import { publishDevAccount } from '../features/dev-console/devConsoleStore'
import { applyLocale, currentLocale } from '../i18n'

export type Account = components['schemas']['AccountView']
type Status = 'loading' | 'anonymous' | 'ready'

type Auth = {
  status: Status
  account: Account | null
  refresh(): Promise<void>
  signIn(view: Account): void
  replaceAccount(view: Account): void
  signOut(): Promise<void>
}

const AuthContext = createContext<Auth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [account, setAccount] = useState<Account | null>(null)

  const replaceAccount = useCallback((view: Account) => {
    setCSRF(view.csrf_token)
    setAccount(view)
    setStatus('ready')
  }, [])

  // spec §4.8：登入後以帳號偏好為準；帳號還沒有偏好時，把登入前已經在用的語言寫進帳號。
  const adopt = useCallback((view: Account) => {
    replaceAccount(view)
    if (view.locale) {
      void applyLocale(view.locale)
      return
    }
    void api('/account/locale', 'PUT', { locale: currentLocale() })
      .then((saved: Account) => replaceAccount(saved))
      .catch(() => undefined)
  }, [replaceAccount])

  const refresh = useCallback(async () => {
    try {
      adopt(await api('/auth/me'))
    } catch {
      setAccount(null)
      setStatus('anonymous')
    }
  }, [adopt])

  const signOut = useCallback(async () => {
    await api('/auth/logout', 'POST')
    setAccount(null)
    setStatus('anonymous')
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => { publishDevAccount(account) }, [account]) // 開發控制台沿用這次 /auth/me，不另外查詢

  const value = useMemo(
    () => ({ status, account, refresh, signIn: adopt, replaceAccount, signOut }),
    [status, account, refresh, adopt, replaceAccount, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>')
  return auth
}
