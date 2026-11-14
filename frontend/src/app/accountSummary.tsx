import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog } from '../components/Dialog'
import { useAuth } from '../features/auth/AuthContext'
import { formatDateTime } from '../i18n/format'
import { useT } from '../i18n/useT'
import { Button } from '../ui'

// 訪客的兩個入口：真正的頁面由免註冊需求做，這一份先接「開發中」（P27、P34）
export const GUEST_REGISTER = '/guest/register'
export const GUEST_LOGIN = '/guest/login'

export type AccountTag = 'student' | 'teacher' | 'guest'

/** 帳號選單（電腦）與帳號面板（手機）共用：名字、角色標籤、第二行（Email 或訪客保留日期）。 */
export function useAccountSummary() {
  const { t, locale } = useT('shell')
  const { account } = useAuth()
  const guest = account?.kind === 'guest'
  const tag: AccountTag = guest ? 'guest' : account?.account_role === 'teacher' ? 'teacher' : 'student'
  // guest_expires_at 是 Unix 秒、可能沒有：不是數字就不寫日期（P27）
  const expires = guest && typeof account?.guest_expires_at === 'number'
    ? t('account.guestUntil', { date: formatDateTime(account.guest_expires_at, locale, 'date') })
    : ''
  return {
    // 訪客的顯示名稱欄位由免註冊需求加（P28）；之前先用 username
    name: account?.username ?? '',
    tag,
    tagLabel: t(`account.tag.${tag}`),
    guest,
    secondLine: guest ? expires : account?.email ?? '',
  }
}

export function RoleTag({ tag, label }: { tag: AccountTag; label: string }) {
  return <span className={`account-tag account-tag--${tag}`}>{label}</span>
}

/** 登出：訪客先確認（G15），其他帳號直接登出。回傳的 confirm 要 render 在畫面上。 */
export function useLogout() {
  const { t } = useT('shell')
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const { guest } = useAccountSummary()
  const [asking, setAsking] = useState(false)

  const logout = () => void signOut().then(() => navigate('/login', { replace: true }))
  const request = () => (guest ? setAsking(true) : logout())
  const confirm = asking
    ? <Dialog
      title={t('guestLogout.title')}
      onClose={() => setAsking(false)}
      footer={<div className="guest-logout__actions">
        <Button variant="primary" data-autofocus onClick={() => { setAsking(false); navigate(GUEST_REGISTER) }}>{t('guestLogout.register')}</Button>
        <Button variant="outline" className="guest-logout__anyway" onClick={() => { setAsking(false); logout() }}>{t('guestLogout.anyway')}</Button>
      </div>}
    >
      <p className="dialog__text">{t('guestLogout.body')}</p>
    </Dialog>
    : null
  return { request, confirm }
}
